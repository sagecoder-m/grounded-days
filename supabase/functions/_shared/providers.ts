// Per-provider OAuth and calendar-read details, kept in one place so the three
// calendar functions stay provider-agnostic.
//
// Both providers can expand recurring events server-side (Google's
// `singleEvents`, Graph's `/calendarView`), so we always ask for concrete
// instances in a date window and never implement RRULE expansion ourselves.

export type ProviderId = "google" | "microsoft";

/** A provider event flattened into the shape the events table stores. */
export interface NormalizedEvent {
  externalId: string;
  calendarId: string;
  title: string;
  /** Null for all-day events, which carry no meaningful instant. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  /** Calendar date the event belongs on, in the event's own offset. */
  date: string;
  location: string | null;
  htmlLink: string | null;
  /** Provider says this instance was deleted/cancelled — prune it locally. */
  cancelled: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  clientId: string;
  clientSecret: string;
  /** Extra params the provider needs on the authorize request. */
  extraAuthParams: Record<string, string>;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export function providerConfig(provider: ProviderId): ProviderConfig {
  if (provider === "google") {
    return {
      id: "google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly", "openid", "email"].join(" "),
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      // access_type=offline is what produces a refresh token at all, and
      // prompt=consent forces one to be reissued on reconnect — without it
      // Google silently omits the refresh token on repeat authorisations and
      // the connection appears to work until the first token refresh fails.
      extraAuthParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    };
  }

  // `common` covers both Entra tenants and personal Microsoft accounts, which
  // is what "both" account types requires.
  return {
    id: "microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // Calendars.Read covers only the user's own calendars. Anything another
    // person shared with them needs Calendars.Read.Shared as well — without it
    // a shared calendar is invisible rather than empty, which is worse.
    scopes: [
      "Calendars.Read",
      "Calendars.Read.Shared",
      "offline_access",
      "openid",
      "email",
      "profile",
    ].join(" "),
    clientId: requireEnv("MICROSOFT_CLIENT_ID"),
    clientSecret: requireEnv("MICROSOFT_CLIENT_SECRET"),
    extraAuthParams: {},
  };
}

export async function exchangeCode(
  config: ProviderConfig,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  return await postToken(config, {
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
}

export async function refreshAccessToken(
  config: ProviderConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  return await postToken(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/** Thrown when the provider says the grant itself is dead, not that a request
 *  failed. Callers translate this into the connection's needs_reauth state. */
export class ReauthRequiredError extends Error {}

async function postToken(
  config: ProviderConfig,
  params: Record<string, string>,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...params,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    // invalid_grant is the one failure that re-trying never fixes: the refresh
    // token has been revoked or has expired (Google's 7-day unverified-app
    // window lands here). Everything else is worth surfacing as a plain error.
    if (text.includes("invalid_grant")) {
      throw new ReauthRequiredError(`${config.id} refresh token rejected: ${text}`);
    }
    throw new Error(`${config.id} token endpoint ${res.status}: ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

/** Identify the connected account so reconnecting updates rather than duplicates. */
export async function fetchAccount(
  provider: ProviderId,
  accessToken: string,
): Promise<{ accountId: string; email: string | null }> {
  const url =
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://graph.microsoft.com/v1.0/me";

  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`${provider} account lookup ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  return provider === "google"
    ? { accountId: data.sub, email: data.email ?? null }
    : { accountId: data.id, email: data.mail ?? data.userPrincipalName ?? null };
}

// ------------------------------------------------------------------ reading

/**
 * Fetch expanded event instances in [windowStart, windowEnd).
 *
 * Paginates to completion. Incremental sync via syncToken/deltaLink is
 * deliberately not used yet: the window is small, a full window read is cheap
 * and idempotent, and cursors add a failure mode (expired cursor needing a
 * silent full resync) that is not worth carrying until sync volume justifies it.
 */
export async function fetchEvents(
  provider: ProviderId,
  accessToken: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<NormalizedEvent[]> {
  const calendars = await listCalendars(provider, accessToken);
  const all: NormalizedEvent[] = [];
  for (const cal of calendars) {
    const events =
      provider === "google"
        ? await fetchGoogleEvents(accessToken, cal.id, windowStart, windowEnd)
        : await fetchMicrosoftEvents(accessToken, cal.id, windowStart, windowEnd);
    all.push(...events);
  }
  return all;
}

interface CalendarRef {
  id: string;
  name: string;
}

/**
 * Every calendar worth reading, not just the default one.
 *
 * A shared calendar is a separate calendar id, so reading only "primary" meant
 * anything shared with the user was silently absent — which looks like a broken
 * sync rather than a missing scope.
 *
 * Google's notion of "selected" is whether the calendar is ticked in their own
 * calendar UI, which is exactly the right filter: it imports what they actually
 * look at, and leaves the holiday and birthday calendars they unticked alone.
 */
async function listCalendars(provider: ProviderId, accessToken: string): Promise<CalendarRef[]> {
  if (provider === "google") {
    const data = await authedJson(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      accessToken,
    );
    const items = (data.items ?? []) as Record<string, unknown>[];
    const chosen = items.filter((c) => !c.deleted && (c.selected === true || c.primary === true));
    // A brand-new account can have nothing marked selected; falling back to
    // primary beats syncing nothing at all.
    const list = chosen.length > 0 ? chosen : items.filter((c) => c.primary === true);
    return list.map((c) => ({ id: String(c.id), name: String(c.summary ?? c.id) }));
  }

  const data = await authedJson("https://graph.microsoft.com/v1.0/me/calendars", accessToken);
  return ((data.value ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? c.id),
  }));
}

async function authedJson(
  url: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, ...extraHeaders },
  });
  if (res.status === 401) {
    throw new ReauthRequiredError(`calendar read rejected the access token: ${await res.text()}`);
  }
  if (!res.ok) {
    throw new Error(`calendar read ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function fetchGoogleEvents(
  accessToken: string,
  calendarId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      // Expands recurrence into individual instances server-side.
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await authedJson(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      accessToken,
    );

    for (const item of data.items ?? []) {
      const allDay = Boolean(item.start?.date);
      const startRaw = item.start?.dateTime ?? item.start?.date ?? null;
      const endRaw = item.end?.dateTime ?? item.end?.date ?? null;
      if (!startRaw) continue;

      events.push({
        // Namespaced by calendar: the same event shared into two calendars can
        // carry the same id, and a bare id would make them collide on the
        // (connection_id, external_id) unique index — one silently overwriting
        // the other.
        externalId: `${calendarId}:${item.id}`,
        calendarId,
        title: item.summary ?? "(no title)",
        startsAt: allDay ? null : startRaw,
        endsAt: allDay ? null : endRaw,
        allDay,
        date: calendarDate(startRaw),
        location: item.location ?? null,
        htmlLink: item.htmlLink ?? null,
        cancelled: item.status === "cancelled",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

async function fetchMicrosoftEvents(
  accessToken: string,
  calendarId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  const params = new URLSearchParams({
    startDateTime: windowStart.toISOString(),
    endDateTime: windowEnd.toISOString(),
    $select: "id,subject,start,end,isAllDay,location,webLink,isCancelled",
    $top: "200",
  });
  // calendarView (not /events) is the endpoint that expands recurrence.
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`;

  while (url) {
    // Ask Graph to return timestamps in UTC so parsing needs no tz lookup.
    const data = await authedJson(url, accessToken, {
      Prefer: 'outlook.timezone="UTC"',
    });

    for (const item of data.value ?? []) {
      const allDay = Boolean(item.isAllDay);
      // Graph returns naive datetimes plus a separate timeZone field; with the
      // Prefer header above that zone is UTC, so make the offset explicit.
      const startRaw: string | null = item.start?.dateTime
        ? `${item.start.dateTime}Z`.replace(/Z+$/, "Z")
        : null;
      const endRaw: string | null = item.end?.dateTime
        ? `${item.end.dateTime}Z`.replace(/Z+$/, "Z")
        : null;
      if (!startRaw) continue;

      events.push({
        externalId: `${calendarId}:${item.id}`,
        calendarId,
        title: item.subject ?? "(no title)",
        startsAt: allDay ? null : startRaw,
        endsAt: allDay ? null : endRaw,
        allDay,
        date: calendarDate(startRaw),
        location: item.location?.displayName ?? null,
        htmlLink: item.webLink ?? null,
        cancelled: Boolean(item.isCancelled),
      });
    }
    url = data["@odata.nextLink"];
  }

  return events;
}

/** Date portion of a provider timestamp, preserving the offset it arrived with
 *  so an 11pm event does not drift onto the following day. */
function calendarDate(raw: string): string {
  // Already a bare date (all-day events).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const offsetMatch = raw.match(/([+-]\d{2}):?(\d{2})$/);
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return raw.slice(0, 10);

  if (!offsetMatch || raw.endsWith("Z")) {
    return instant.toISOString().slice(0, 10);
  }
  const sign = offsetMatch[1].startsWith("-") ? -1 : 1;
  const offsetMinutes = sign * (Number(offsetMatch[1].slice(1)) * 60 + Number(offsetMatch[2]));
  return new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}
