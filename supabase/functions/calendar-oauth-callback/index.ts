// Completes the OAuth handshake the provider redirected back to.
//
// This endpoint is reached by the user's browser, not by app code, so it always
// answers with a redirect the app can render rather than JSON. Errors travel as
// a query param so the UI can explain what happened instead of showing a blank
// page on a failed connect.
import {
  exchangeCode,
  fetchAccount,
  providerConfig,
  type ProviderId,
} from "../_shared/providers.ts";
import { appBaseUrl, callbackUrl, serviceClient } from "../_shared/supabase.ts";

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to } });
}

/** Send the user back into the app with a result the Profile page can read. */
function backToApp(params: Record<string, string>, redirectTo?: string | null): Response {
  const base = `${appBaseUrl()}${redirectTo ?? "/profile"}`;
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return redirect(url.toString());
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const db = serviceClient();

  try {
    // The user declined consent, or the provider refused outright.
    if (providerError) {
      return backToApp({ calendar: "error", reason: providerError });
    }
    if (!code || !state) {
      return backToApp({ calendar: "error", reason: "missing_code_or_state" });
    }

    // Consume the state row. Its presence is what proves this callback belongs
    // to a handshake we started, and deleting it makes the code single-use.
    const { data: stateRow, error: stateError } = await db
      .from("calendar_oauth_states")
      .select("*")
      .eq("state", state)
      .maybeSingle();
    if (stateError) throw new Error(`state lookup failed: ${stateError.message}`);
    if (!stateRow) {
      return backToApp({ calendar: "error", reason: "unknown_or_expired_state" });
    }
    await db.from("calendar_oauth_states").delete().eq("state", state);

    const provider = stateRow.provider as ProviderId;
    const config = providerConfig(provider);
    const tokens = await exchangeCode(config, code, stateRow.code_verifier, callbackUrl());

    // Without a refresh token the connection can only ever work for an hour,
    // which would look like a success now and a mystery failure later.
    if (!tokens.refresh_token) {
      return backToApp({ calendar: "error", reason: "no_refresh_token" }, stateRow.redirect_to);
    }

    const account = await fetchAccount(provider, tokens.access_token);

    // Reconnecting the same account must update it, not add a second row.
    const { data: connection, error: upsertError } = await db
      .from("calendar_connections")
      .upsert(
        {
          user_id: stateRow.user_id,
          provider,
          account_id: account.accountId,
          account_email: account.email,
          // Outlook is where work lives and Google where personal life does —
          // a useful default, changeable in the UI.
          default_area: provider === "microsoft" ? "professional" : "personal",
          status: "connected",
          status_detail: null,
          sync_cursor: null,
        },
        { onConflict: "user_id,provider,account_id" },
      )
      .select("id")
      .single();
    if (upsertError) throw new Error(`connection upsert failed: ${upsertError.message}`);

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: credError } = await db.from("calendar_credentials").upsert({
      connection_id: connection.id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      scope: tokens.scope ?? config.scopes,
    });
    if (credError) throw new Error(`credential upsert failed: ${credError.message}`);

    return backToApp({ calendar: "connected", provider }, stateRow.redirect_to);
  } catch (err) {
    console.error("calendar-oauth-callback failed", err);
    // The reason travels back to the app, so a failure can be diagnosed from
    // the screen it happened on rather than from the function logs.
    return backToApp({ calendar: "error", reason: "exchange_failed", detail: shortReason(err) });
  }
});

/**
 * A short, safe code for what went wrong, to show the person in front of it.
 *
 * "Something went wrong finishing the connection" is true and useless — the
 * actual answer (an expired secret, a redirect URI registered under the wrong
 * platform, consent withheld) is a specific code the provider already sent us
 * and we were dropping on the floor. Finding it meant opening the Edge
 * Function logs in another dashboard, which is not a thing to ask of someone
 * connecting a calendar.
 *
 * Deliberately an extraction rather than a truncation. The thrown message
 * carries the provider's whole response body, and passing that through a URL
 * into a page would be echoing an upstream payload we do not control. Only
 * three shapes are ever emitted, each matched by a narrow pattern:
 *
 *   AADSTS12345      Microsoft's own error codes, which name the cause exactly
 *   invalid_client   the OAuth `error` field, which is a fixed vocabulary
 *   http_401         the status, when the body says nothing useful
 *
 * All three are public identifiers. None can carry a token or a secret.
 */
function shortReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  const aadsts = message.match(/AADSTS\d+/);
  if (aadsts) return aadsts[0];

  const oauthError = message.match(/"error"\s*:\s*"([a-z_]{3,40})"/);
  if (oauthError) return oauthError[1];

  const status = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (status) return `http_${status[1]}`;

  return "unknown";
}
