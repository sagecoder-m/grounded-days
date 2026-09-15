// Account administration for the HQ portal.
//
// Lives server-side because both operations need the service role: creating a
// user and listing users are auth-admin APIs the browser key cannot call. The
// caller's JWT is verified first and then checked against admin_users — being
// signed in is not enough, and the admin check happens here rather than
// trusting anything the client asserts about itself.
//
// List returns id, email, created_at and last_sign_in_at only. last_sign_in_at
// is the minimum needed for the pilot's retention picture; nothing about what
// anyone did inside the app crosses this boundary.
import {
  corsHeaders,
  HttpError,
  jsonResponse,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";
import { seedDemoData } from "./seed.ts";

interface CreatePayload {
  action: "create";
  email: string;
  password: string;
  /** Omitted or "tester" for an ordinary pilot account. "clinician" also
   *  writes the new user into clinician_users, in the same service-role
   *  action that creates it — see the clinician_accounts migration for why
   *  that table has no separate promotion trigger the way admin/demo do. */
  kind?: "tester" | "clinician";
}

interface ListPayload {
  action: "list";
}

/**
 * Set a new password on one account, by email.
 *
 * The counterpart to create. Credentials are handed to testers directly and
 * email_confirm is on, so a tester who forgets their password — or whose
 * generated one was never written down — has no way back short of the Supabase
 * dashboard. The self-serve reset on /auth covers anyone whose email works;
 * this covers the rest, and is the only answer when the address itself is the
 * problem.
 *
 * By email rather than by id, for the same reason "seed" is: the admin knows
 * the address, and a typo then fails to find anyone instead of quietly landing
 * on some other tester's account.
 */
interface ResetPasswordPayload {
  action: "reset_password";
  email: string;
  password: string;
}

/**
 * Fill one account with sample data, by email.
 *
 * By email rather than by id because the admin knows the demo's address and
 * would otherwise have to go and look up a uuid — and because an email typo
 * fails to find anyone, where a mistyped uuid could plausibly match a real
 * tester and wipe them. The lookup is exact and the account must already exist.
 */
interface SeedPayload {
  action: "seed";
  email: string;
}

/**
 * Delete one account outright, by email.
 *
 * Nothing here has to tidy up after it: 28 of the 29 foreign keys into
 * auth.users are ON DELETE CASCADE, so the tasks, goals, journal, calendar
 * connections, passcode and settings all go in the same transaction as the
 * user row. The one exception is deliberate — client_errors.user_id is SET
 * NULL, because an error report is about the app, not the person who hit it.
 */
interface DeleteAccountPayload {
  action: "delete_account";
  email: string;
}

/**
 * Forget one account's passcode, so the app offers to set a new one.
 *
 * The passcode is the one lock with no self-serve way out: the hash lives in
 * user_security, which the client cannot read or write at all, and five wrong
 * attempts start a backoff that reaches fifteen minutes. A tester who forgets
 * their passcode is locked out of a working account with a correct password,
 * and until now HQ could do nothing about it.
 */
interface ClearPasscodePayload {
  action: "clear_passcode";
  email: string;
}

/** Clinician accounts, each with the emails currently on its roster — what
 *  the admin console's roster editor renders. */
interface ListCliniciansPayload {
  action: "list-clinicians";
}

/** Add or remove one patient from one clinician's roster. By email on both
 *  sides, for the same reason "seed" is: the admin types an address, and a
 *  typo then fails closed instead of silently matching the wrong account. */
interface RosterPayload {
  action: "assign-patient" | "unassign-patient";
  clinicianEmail: string;
  patientEmail: string;
}

type Payload =
  | CreatePayload
  | ListPayload
  | ResetPasswordPayload
  | DeleteAccountPayload
  | ClearPasscodePayload
  | SeedPayload
  | ListCliniciansPayload
  | RosterPayload;

async function requireAdmin(req: Request): Promise<string> {
  const user = await requireUser(req);
  const { data, error } = await serviceClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new HttpError(500, "Admin check failed");
  if (!data) throw new HttpError(403, "Not an admin");
  return user.id;
}

/**
 * The account an admin named, or a 404 saying which address found nobody.
 *
 * Lookup is by email throughout these actions, so the admin types an address
 * they already know instead of copying a uuid — and a typo then fails to find
 * anyone rather than quietly matching some other tester's account.
 */
async function requireUserByEmail(raw: string | undefined) {
  const email = raw?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid email is required");
  }
  const { data, error } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) throw new HttpError(500, error.message);
  const target = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!target) throw new HttpError(404, `No account for ${email}`);
  return target;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new HttpError(405, "POST only");
    await requireAdmin(req);

    const payload = (await req.json()) as Payload;

    if (payload.action === "list") {
      // The pilot is capped well under one page; revisit pagination if that
      // changes rather than pretending to support it untested.
      const { data, error } = await serviceClient().auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
        })),
      });
    }

    if (payload.action === "create") {
      const email = payload.email?.trim().toLowerCase();
      const password = payload.password ?? "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "A valid email is required");
      }
      if (password.length < 8) {
        throw new HttpError(400, "Password must be at least 8 characters");
      }

      // email_confirm: the pilot admin hands credentials to testers directly,
      // so a confirmation email loop would only be a place for onboarding to
      // stall. The address is trusted because the admin typed it.
      const { data, error } = await serviceClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new HttpError(400, error.message);

      if (payload.kind === "clinician") {
        const { error: clinicianError } = await serviceClient()
          .from("clinician_users")
          .insert({ user_id: data.user.id });
        // The auth user already exists at this point. Failing the whole
        // request would leave HQ believing nothing happened when a working
        // login actually was created — better to hand back the credentials
        // and say plainly that the clinician flag needs a retry.
        if (clinicianError) {
          return jsonResponse({
            id: data.user.id,
            email: data.user.email,
            warning: "Account created, but could not be marked as a clinician account.",
          });
        }
      }

      return jsonResponse({ id: data.user.id, email: data.user.email });
    }

    if (payload.action === "reset_password") {
      const email = payload.email?.trim().toLowerCase();
      const password = payload.password ?? "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "A valid email is required");
      }
      if (password.length < 8) {
        throw new HttpError(400, "Password must be at least 8 characters");
      }

      const { data, error } = await serviceClient().auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      if (error) throw new HttpError(500, error.message);
      const target = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!target) throw new HttpError(404, `No account for ${email}`);

      // The new password is never logged and never returned: the admin already
      // has it, since their own browser generated it. The response says only
      // which account it landed on.
      const { error: updateError } = await serviceClient().auth.admin.updateUserById(target.id, {
        password,
      });
      if (updateError) throw new HttpError(400, updateError.message);
      return jsonResponse({ id: target.id, email: target.email });
    }

    if (payload.action === "delete_account") {
      const target = await requireUserByEmail(payload.email);

      // Admins are refused, which includes whoever is asking: an admin who
      // deleted their own account would take HQ's only way in with them, and
      // the cascade would erase the pilot's own data on the way out. Removing
      // an admin is a deliberate enough act to deserve the dashboard.
      const { data: adminRow } = await serviceClient()
        .from("admin_users")
        .select("user_id")
        .eq("user_id", target.id)
        .maybeSingle();
      if (adminRow) {
        throw new HttpError(400, `${target.email} is an admin account — delete it from Supabase`);
      }

      // Hard delete, stated rather than left to the default: a soft delete
      // leaves the row in auth.users, so not one of the ON DELETE CASCADE keys
      // fires and every table keeps its rows for an account nobody can sign
      // into. The whole point here is that the data goes too.
      const { error } = await serviceClient().auth.admin.deleteUser(target.id, false);
      if (error) throw new HttpError(400, error.message);
      return jsonResponse({ email: target.email });
    }

    if (payload.action === "clear_passcode") {
      const target = await requireUserByEmail(payload.email);

      // Deletes the row rather than blanking the hash, so failed_attempts and
      // locked_until go with it — someone who tripped the lockout should not
      // have to sit out the backoff as well. has_passcode() then returns false
      // and the app offers to set a new one. Their data is untouched.
      const { error } = await serviceClient()
        .from("user_security")
        .delete()
        .eq("user_id", target.id);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ email: target.email });
    }

    if (payload.action === "seed") {
      const email = payload.email?.trim().toLowerCase();
      if (!email) throw new HttpError(400, "An email is required");

      const { data, error } = await serviceClient().auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      if (error) throw new HttpError(500, error.message);
      const target = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!target) throw new HttpError(404, `No account for ${email}`);

      // Replaces that account's content. Said plainly in the HQ panel too — it
      // is the whole point (a re-seed should leave one demo, not two), but it
      // is destructive and must never be a surprise.
      const counts = await seedDemoData(target.id);
      return jsonResponse({ email, counts });
    }

    if (payload.action === "list-clinicians") {
      const [{ data: clinicianRows, error: clinicianErr }, { data: userPage, error: usersErr }] =
        await Promise.all([
          serviceClient().from("clinician_users").select("user_id"),
          serviceClient().auth.admin.listUsers({ page: 1, perPage: 500 }),
        ]);
      if (clinicianErr) throw new HttpError(500, clinicianErr.message);
      if (usersErr) throw new HttpError(500, usersErr.message);

      const emailById = new Map(userPage.users.map((u) => [u.id, u.email ?? null]));
      const clinicianIds = (clinicianRows ?? []).map((r) => r.user_id as string);
      if (clinicianIds.length === 0) return jsonResponse({ clinicians: [] });

      // One query for every roster row across every clinician, then grouped
      // in memory — a handful of clinicians in a pilot, not a scale where N
      // round trips would matter.
      const { data: rosterRows, error: rosterErr } = await serviceClient()
        .from("clinician_patients")
        .select("clinician_user_id, patient_user_id")
        .in("clinician_user_id", clinicianIds);
      if (rosterErr) throw new HttpError(500, rosterErr.message);

      const patientsByClinicianId = new Map<string, string[]>();
      for (const row of rosterRows ?? []) {
        const list = patientsByClinicianId.get(row.clinician_user_id) ?? [];
        const email = emailById.get(row.patient_user_id);
        if (email) list.push(email);
        patientsByClinicianId.set(row.clinician_user_id, list);
      }

      return jsonResponse({
        clinicians: clinicianIds.map((id) => ({
          email: emailById.get(id) ?? null,
          patients: (patientsByClinicianId.get(id) ?? []).sort(),
        })),
      });
    }

    if (payload.action === "assign-patient" || payload.action === "unassign-patient") {
      const clinicianEmail = payload.clinicianEmail?.trim().toLowerCase();
      const patientEmail = payload.patientEmail?.trim().toLowerCase();
      if (!clinicianEmail || !patientEmail) {
        throw new HttpError(400, "Both a clinician and a patient email are required");
      }

      const { data: userPage, error: usersErr } = await serviceClient().auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      if (usersErr) throw new HttpError(500, usersErr.message);
      const clinician = userPage.users.find(
        (u) => (u.email ?? "").toLowerCase() === clinicianEmail,
      );
      const patient = userPage.users.find((u) => (u.email ?? "").toLowerCase() === patientEmail);
      if (!clinician) throw new HttpError(404, `No account for ${clinicianEmail}`);
      if (!patient) throw new HttpError(404, `No account for ${patientEmail}`);

      const { data: isClinicianRow } = await serviceClient()
        .from("clinician_users")
        .select("user_id")
        .eq("user_id", clinician.id)
        .maybeSingle();
      if (!isClinicianRow) throw new HttpError(400, `${clinicianEmail} is not a clinician account`);

      if (payload.action === "assign-patient") {
        const { error } = await serviceClient()
          .from("clinician_patients")
          .upsert({ clinician_user_id: clinician.id, patient_user_id: patient.id });
        if (error) throw new HttpError(500, error.message);
      } else {
        const { error } = await serviceClient()
          .from("clinician_patients")
          .delete()
          .eq("clinician_user_id", clinician.id)
          .eq("patient_user_id", patient.id);
        if (error) throw new HttpError(500, error.message);
      }
      return jsonResponse({ ok: true });
    }

    throw new HttpError(400, "Unknown action");
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
    console.error("admin-accounts error", err);
    return jsonResponse({ error: "Something went wrong" }, 500);
  }
});
