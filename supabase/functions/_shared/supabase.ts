// Shared helpers for the calendar functions: a service-role client, the caller's
// identity, and the redirect URI the providers are registered against.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

/** Bypasses RLS. Needed because calendar_credentials has no policies at all. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the caller from their Authorization header.
 *
 * The functions that act on a user's behalf must never take a user id from the
 * request body — that would let any authenticated caller drive someone else's
 * connections. The JWT is the only trusted source of identity here.
 */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token");
  }
  const { data, error } = await serviceClient().auth.getUser(authHeader.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError(401, "Invalid token");
  return { id: data.user.id };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The single redirect URI registered with both providers. */
export function callbackUrl(): string {
  return `${requireEnv("SUPABASE_URL")}/functions/v1/calendar-oauth-callback`;
}

/** Where to send the browser once the handshake finishes. */
export function appBaseUrl(): string {
  return requireEnv("APP_BASE_URL").replace(/\/$/, "");
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
