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

type Payload = CreatePayload | ListPayload | SeedPayload | ListCliniciansPayload | RosterPayload;

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
