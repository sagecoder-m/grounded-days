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

interface CreatePayload {
  action: "create";
  email: string;
  password: string;
}

interface ListPayload {
  action: "list";
}

type Payload = CreatePayload | ListPayload;

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
      return jsonResponse({ id: data.user.id, email: data.user.email });
    }

    throw new HttpError(400, "Unknown action");
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
    console.error("admin-accounts error", err);
    return jsonResponse({ error: "Something went wrong" }, 500);
  }
});
