// Begins a calendar connection: mints PKCE + state, records them, and hands
// back the provider's authorize URL for the browser to visit.
//
// The browser never sees a client secret and never constructs this URL itself,
// so a tampered redirect_uri or scope set is not something the client can do.
import { providerConfig, type ProviderId } from "../_shared/providers.ts";
import {
  callbackUrl,
  corsHeaders,
  HttpError,
  jsonResponse,
  requireUser,
  serviceClient,
} from "../_shared/supabase.ts";

function randomUrlSafe(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const { provider, redirectTo } = (await req.json()) as {
      provider?: ProviderId;
      redirectTo?: string;
    };

    if (provider !== "google" && provider !== "microsoft") {
      throw new HttpError(400, "provider must be 'google' or 'microsoft'");
    }

    const config = providerConfig(provider);
    const state = randomUrlSafe();
    const codeVerifier = randomUrlSafe(64);

    const db = serviceClient();
    const { error } = await db.from("calendar_oauth_states").insert({
      state,
      user_id: user.id,
      provider,
      code_verifier: codeVerifier,
      redirect_to: redirectTo ?? null,
    });
    if (error) throw new Error(`could not record oauth state: ${error.message}`);

    // Opportunistic sweep of abandoned handshakes; keeps the table from
    // accumulating rows for flows the user started and never finished.
    await db
      .from("calendar_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString());

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: callbackUrl(),
      scope: config.scopes,
      state,
      code_challenge: await s256(codeVerifier),
      code_challenge_method: "S256",
      ...config.extraAuthParams,
    });

    return jsonResponse({ authorizeUrl: `${config.authorizeUrl}?${params}` });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error("calendar-oauth-start failed", err);
    return jsonResponse({ error: (err as Error).message }, status);
  }
});
