// Pulls events from every connected calendar into public.events.
//
// Invoked two ways: by the user pressing "Sync now" (bearer token present, syncs
// only that user), and by a schedule using the service role key (no user, syncs
// every connection). One code path serves both so scheduled and manual runs
// cannot drift in behaviour.
import {
  fetchEvents,
  type NormalizedEvent,
  providerConfig,
  type ProviderId,
  ReauthRequiredError,
  refreshAccessToken,
} from "../_shared/providers.ts";
import { parseIcs } from "../_shared/ics.ts";
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/supabase.ts";

// How much calendar to mirror. Past days are kept small — Grounded shows what
// is coming up, and back-filling months of history would bloat the table for
// no benefit.
const WINDOW_DAYS_PAST = 7;
const WINDOW_DAYS_FUTURE = 120;

// Refresh a little early rather than racing a token that expires mid-request.
const EXPIRY_SKEW_MS = 60_000;

interface ConnectionRow {
  id: string;
  user_id: string;
  /** ProviderId covers the two OAuth providers; feeds are their own kind. */
  provider: ProviderId | "ical";
  default_area: string | null;
  /** Only ever set for an ical connection. */
  feed_url: string | null;
}

interface CredentialRow {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

/** Reuse a live access token; refresh only when it is missing or near expiry. */
async function accessTokenFor(
  db: ReturnType<typeof serviceClient>,
  // Narrowed deliberately: there is no token to refresh for a feed, and taking
  // the wider type here would let an ical connection reach providerConfig().
  connection: ConnectionRow & { provider: ProviderId },
  credential: CredentialRow,
): Promise<string> {
  const expiresAt = credential.access_token_expires_at
    ? Date.parse(credential.access_token_expires_at)
    : 0;
  if (credential.access_token && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return credential.access_token;
  }

  const config = providerConfig(connection.provider);
  const tokens = await refreshAccessToken(config, credential.refresh_token);

  await db
    .from("calendar_credentials")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      // Providers may hand back a rotated refresh token; keeping the old one
      // would work until it silently stopped.
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    })
    .eq("connection_id", connection.id);

  return tokens.access_token;
}

/**
 * Fetch and parse an iCal feed.
 *
 * No OAuth, no token, no refresh: the feed URL is the credential, which is why
 * an ical connection has no calendar_credentials row at all. It is also the only
 * provider where recurrence has to be expanded here rather than by the provider
 * — see _shared/ics.ts.
 */
async function fetchIcsEvents(
  feedUrl: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<NormalizedEvent[]> {
  // webcal:// is the same thing over https; feeds are commonly published with it.
  const url = feedUrl.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain, */*" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`feed returned ${res.status}`);
  }

  const body = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(body)) {
    // A wrong URL usually returns an HTML page, and parsing that yields zero
    // events — which would look like an empty calendar rather than a mistake.
    throw new Error("that URL did not return a calendar feed");
  }

  const { events, unsupportedRules, skipped } = parseIcs(body, windowStart, windowEnd);
  if (unsupportedRules > 0 || skipped > 0) {
    console.warn(
      `ics feed: ${unsupportedRules} unsupported recurrence rule(s), ${skipped} unparseable event(s)`,
    );
  }
  return events;
}


/**
 * How many ids to name in one delete.
 *
 * PostgREST puts an `in` list in the request URL, and a Microsoft event id runs
 * to about a hundred and fifty characters — so this is a URL length budget
 * rather than a query cost. Twenty-five keeps the longest realistic batch
 * comfortably inside four kilobytes.
 */
const PRUNE_BATCH = 25;

/** Split into fixed-size batches. Empty input yields nothing, so callers can
 *  loop unconditionally instead of guarding on length first. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function syncConnection(
  db: ReturnType<typeof serviceClient>,
  connection: ConnectionRow,
): Promise<{ imported: number; removed: number }> {
  const now = Date.now();
  const windowStart = new Date(now - WINDOW_DAYS_PAST * 86_400_000);
  const windowEnd = new Date(now + WINDOW_DAYS_FUTURE * 86_400_000);

  let events: NormalizedEvent[];

  if (connection.provider === "ical") {
    if (!connection.feed_url) throw new Error("this feed has no URL stored");
    events = await fetchIcsEvents(connection.feed_url, windowStart, windowEnd);
  } else {
    const { data: credential, error: credError } = await db
      .from("calendar_credentials")
      .select("refresh_token, access_token, access_token_expires_at")
      .eq("connection_id", connection.id)
      .single();
    if (credError || !credential) {
      throw new Error(`no credentials stored for connection ${connection.id}`);
    }

    const accessToken = await accessTokenFor(
      db,
      connection as ConnectionRow & { provider: ProviderId },
      credential,
    );
    events = await fetchEvents(connection.provider, accessToken, windowStart, windowEnd);
  }

  const live = events.filter((e) => !e.cancelled);
  const cancelled = events.filter((e) => e.cancelled);

  if (live.length > 0) {
    const rows = live.map((event: NormalizedEvent) => ({
      user_id: connection.user_id,
      connection_id: connection.id,
      source: connection.provider,
      external_id: event.externalId,
      external_calendar_id: event.calendarId,
      title: event.title,
      date: event.date,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      all_day: event.allDay,
      location: event.location,
      html_link: event.htmlLink,
      area: connection.default_area,
    }));

    const { error } = await db
      .from("events")
      .upsert(rows, { onConflict: "connection_id,external_id" });
    if (error) throw new Error(`event upsert failed: ${error.message}`);
  }

  let removed = 0;

  // Instances the provider explicitly reports as cancelled.
  for (const batch of chunk(
    cancelled.map((e) => e.externalId),
    PRUNE_BATCH,
  )) {
    const { error, count } = await db
      .from("events")
      .delete({ count: "exact" })
      .eq("connection_id", connection.id)
      .in("external_id", batch);
    if (error) throw new Error(`cancelled prune failed: ${error.message}`);
    removed += count ?? 0;
  }

  /*
    Events deleted at the provider simply stop appearing, so anything still
    stored inside the window that the provider no longer returned is stale.
    Scoped to the window so events outside it are never mistaken for deletions.

    This used to ask the database to delete everything NOT in the list of ids
    just seen, which puts every kept id into the request URL. Google's ids are
    short and it never mattered; Microsoft's are around a hundred and fifty
    characters each, so a hundred and thirty of them produced a URL long enough
    that PostgREST answered "Bad Request" — the events synced, then the sync
    was marked failed by the step that runs after them.

    Reading the stored ids and deleting the difference inverts the size problem.
    The list in the URL becomes the events that have actually gone, which is
    normally none and occasionally a handful, rather than everything that
    remains. The read itself is a filtered GET with no long URL.
  */
  const keep = new Set(live.map((e) => e.externalId));
  const { data: storedRows, error: storedError } = await db
    .from("events")
    .select("external_id")
    .eq("connection_id", connection.id)
    .gte("date", windowStart.toISOString().slice(0, 10))
    .lte("date", windowEnd.toISOString().slice(0, 10));
  if (storedError) throw new Error(`stale read failed: ${storedError.message}`);

  const staleIds = (storedRows ?? [])
    .map((row: { external_id: string | null }) => row.external_id)
    .filter((id: string | null): id is string => Boolean(id) && !keep.has(id));

  let staleCount = 0;
  // Chunked for the same reason: even the stale list must not be assumed small
  // enough for one URL when a whole calendar has been emptied at the provider.
  for (const batch of chunk(staleIds, PRUNE_BATCH)) {
    const { error, count } = await db
      .from("events")
      .delete({ count: "exact" })
      .eq("connection_id", connection.id)
      .in("external_id", batch);
    if (error) throw new Error(`stale prune failed: ${error.message}`);
    staleCount += count ?? 0;
  }
  removed += staleCount ?? 0;

  await db
    .from("calendar_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      status_detail: null,
    })
    .eq("id", connection.id);

  return { imported: live.length, removed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = serviceClient();

  try {
    // A user token scopes the run to that user; the service role key (used by
    // the schedule) syncs everything.
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    let userId: string | null = null;
    if (authHeader && authHeader !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data, error } = await db.auth.getUser(authHeader);
      if (error || !data.user) return jsonResponse({ error: "Invalid token" }, 401);
      userId = data.user.id;
    }

    let query = db.from("calendar_connections").select("id, user_id, provider, default_area, feed_url");
    if (userId) query = query.eq("user_id", userId);

    const { data: connections, error } = await query;
    if (error) throw new Error(`connection lookup failed: ${error.message}`);

    const results: Record<string, unknown>[] = [];

    // Connections are synced independently: one dead grant must not stop the
    // others from updating.
    for (const connection of (connections ?? []) as ConnectionRow[]) {
      try {
        const counts = await syncConnection(db, connection);
        results.push({ connectionId: connection.id, ...counts });
      } catch (err) {
        const needsReauth = err instanceof ReauthRequiredError;
        await db
          .from("calendar_connections")
          .update({
            status: needsReauth ? "needs_reauth" : "error",
            status_detail: (err as Error).message.slice(0, 500),
          })
          .eq("id", connection.id);

        console.error(`sync failed for connection ${connection.id}`, err);
        results.push({
          connectionId: connection.id,
          error: needsReauth ? "needs_reauth" : "error",
        });
      }
    }

    return jsonResponse({ synced: results });
  } catch (err) {
    console.error("calendar-sync failed", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
