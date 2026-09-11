import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearch } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarCheck, RefreshCw, Unplug } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { actions, AREA_META } from "@/lib/store";
import type {
  Area,
  CalendarConnection,
  CalendarProvider,
  ConnectionStatus,
} from "@/lib/store-types";
import { useSession } from "@/lib/use-session";

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  microsoft: "Outlook Calendar",
  ical: "Calendar feed",
};

/** The two providers reached through OAuth. A feed is subscribed to instead. */
const OAUTH_PROVIDERS = ["microsoft", "google"] as const;

/** Reasons the OAuth callback can bounce back, in the app's voice. */
const CONNECT_ERRORS: Record<string, string> = {
  // access_denied covers two very different things and the app cannot tell them
  // apart: someone pressing Cancel, and Google refusing an account that is not on
  // the OAuth consent screen's tester list while the app is unverified. Saying
  // "you cancelled" to the second case sends a tester back to try the same thing
  // again forever, so the message names both.
  access_denied:
    "Not connected. If you changed your mind, nothing happened. If Google said “access blocked”, that account has not been added to the tester list yet — send it to whoever set up the pilot.",
  no_refresh_token:
    "The provider didn't grant long-term access. Try connecting again and accept every prompt.",
  unknown_or_expired_state: "That connection attempt timed out. Please try again.",
  exchange_failed: "Something went wrong finishing the connection.",
  missing_code_or_state: "The provider sent back an incomplete response.",
};

function relativeTime(iso?: string): string {
  if (!iso) return "not yet";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The four tabs a calendar connection can sit under.
 *
 * Three of them are `ConnectionStatus` itself — the field the sync function
 * already writes after every attempt — read as tiers of reliability rather
 * than as an internal enum: a calendar is either working, waiting on you to
 * reconnect it, or stuck. Nothing here is invented; it is the same status
 * `ConnectionRow` has always branched on, just used to sort rather than only
 * to decorate one row at a time.
 *
 * "policy" is not a connection state at all — it is a fixed fourth tab so
 * Terms and Privacy have a home next to the exact feature that raises "what
 * happens to my data" questions, rather than only at the bottom of the page
 * under Delete my data, which is where they used to live alone.
 */
type Tab = ConnectionStatus | "policy";

const STATUS_TABS: { status: ConnectionStatus; label: string; empty: string }[] = [
  { status: "connected", label: "Working", empty: "Nothing connected yet — add one below." },
  {
    status: "needs_reauth",
    label: "Needs reconnecting",
    empty: "Nothing needs reconnecting. \u{1F44D}",
  },
  { status: "error", label: "Not syncing", empty: "Nothing is stuck." },
];

export function CalendarConnectionsSection() {
  const { user } = useSession();
  const router = useRouter();
  // The OAuth callback redirects here with the outcome in the query string.
  const search = useSearch({ strict: false }) as {
    calendar?: string;
    reason?: string;
    detail?: string;
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const connections = useQuery({
    ...calendarConnectionsQuery(user?.id ?? ""),
    enabled: Boolean(user),
  });

  // Report the handshake result once, then strip it from the URL so a refresh
  // doesn't re-toast a stale outcome.
  useEffect(() => {
    if (!search.calendar) return;
    if (search.calendar === "connected") {
      toast.success("Calendar connected", { description: "Pulling your events in now." });
      void actions.syncCalendarsNow().catch(() => {
        // syncCalendarsNow toasts its own failure; the connection still stands.
      });
    } else {
      /*
        The provider's own code, when there is one, appended to the sentence.

        "Something went wrong finishing the connection" is true and useless:
        the cause — an expired secret, a redirect URI on the wrong platform,
        consent withheld — is a specific code the provider sent us, and it used
        to be visible only by opening the Edge Function logs in a separate
        dashboard. It is a short public identifier, so it costs nothing to show
        and saves the one step that actually diagnoses the problem.
      */
      const base = CONNECT_ERRORS[search.reason ?? ""] ?? "Please try again.";
      const code = search.detail && search.detail !== "unknown" ? ` (${search.detail})` : "";
      toast.error("Couldn't connect that calendar", { description: `${base}${code}` });
    }
    void router.navigate({ to: "/profile", replace: true, search: {} });
  }, [search.calendar, search.reason, search.detail, router]);

  async function connect(provider: CalendarProvider) {
    setBusy(provider);
    try {
      // Full navigation rather than a popup: the provider consent screens
      // refuse to render in an iframe, and popups get blocked on mobile.
      window.location.href = await actions.startCalendarConnect(provider);
    } catch (err) {
      toast.error("Couldn't start that connection", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    try {
      await actions.syncCalendarsNow();
      toast.success("Calendars up to date");
    } catch (err) {
      toast.error("Sync didn't finish", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(null);
    }
  }

  /*
    Memoized on connections.data itself, not on a `?? []` fallback of it. The
    fallback reads fine but creates a new empty array on every render while
    the query is loading — a fresh reference each time, which would make the
    grouping below "depend on rows" in name only and recompute regardless of
    whether anything actually changed.
  */
  const rows = useMemo(() => connections.data ?? [], [connections.data]);
  /**
   * How many of each kind are already connected.
   *
   * Used only to word the button, never to hide it. The buttons used to be
   * filtered out once a provider appeared, which quietly capped everyone at one
   * Google and one Outlook — and plenty of people have a personal and a work
   * calendar of the same kind, or three feeds and nothing else.
   */
  const countByProvider = rows.reduce<Record<string, number>>((acc, c) => {
    acc[c.provider] = (acc[c.provider] ?? 0) + 1;
    return acc;
  }, {});

  const byStatus = useMemo(() => {
    const groups: Record<ConnectionStatus, CalendarConnection[]> = {
      connected: [],
      needs_reauth: [],
      error: [],
    };
    for (const c of rows) groups[c.status].push(c);
    return groups;
  }, [rows]);

  /*
    Which tab is open first, decided once per visit rather than pinned.

    Profile is somewhere you go to manage things, not a passive dashboard, so
    if a calendar is actually stuck it leads — most severe first among
    whichever tabs are non-empty. A page with nothing broken opens on "Working"
    instead of forcing a click past two empty tabs to see the good news. Once
    someone has touched a tab by hand this stops recomputing, so switching to
    "Terms & Privacy" to read something does not get yanked back the moment a
    background sync changes a status underneath them.
  */
  const defaultTab: Tab =
    byStatus.error.length > 0
      ? "error"
      : byStatus.needs_reauth.length > 0
        ? "needs_reauth"
        : "connected";
  const activeTab = tab ?? defaultTab;

  return (
    <section className="card-soft p-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Connected calendars</h2>
        {rows.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void syncNow()}
            disabled={busy !== null}
            className="gap-2 rounded-full"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        )}
      </div>

      <p className="text-sm text-ink-soft max-w-lg">
        Bring your real schedule alongside your tasks. Connect as many accounts as you like —
        several Google calendars, a work and a personal Outlook, any mix of the three. Everything
        comes in read-only; grounded never changes anything at the source.
      </p>

      {/*
        The tab strip itself. Same plain-button, aria-pressed pattern as the
        board's own Edit size / Add widget switch — one visual language for
        "two or more views sharing a row" rather than a different control
        every time this shape comes up.

        Each status tab carries a count so a problem is visible without a
        click — "Needs reconnecting 1" is the whole point of organizing this
        by reliability instead of one flat list.
      */}
      <div className="flex flex-wrap items-center gap-1 overflow-hidden rounded-full border border-tan">
        {STATUS_TABS.map(({ status, label }) => (
          <TabButton key={status} active={activeTab === status} onClick={() => setTab(status)}>
            {label}
            {byStatus[status].length > 0 && (
              <span className="ml-1 tabular-nums opacity-70">{byStatus[status].length}</span>
            )}
          </TabButton>
        ))}
        <TabButton active={activeTab === "policy"} onClick={() => setTab("policy")}>
          Terms &amp; Privacy
        </TabButton>
      </div>

      {activeTab === "policy" ? (
        <PolicyPanel />
      ) : (
        <ul className="space-y-3">
          {byStatus[activeTab].length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border p-4 text-center text-sm italic text-ink-soft">
              {STATUS_TABS.find((t) => t.status === activeTab)?.empty}
            </li>
          ) : (
            byStatus[activeTab].map((connection) => (
              <ConnectionRow
                key={connection.id}
                connection={connection}
                busy={busy !== null}
                onReconnect={() => void connect(connection.provider)}
              />
            ))
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        {(OAUTH_PROVIDERS as readonly CalendarProvider[]).map((provider) => (
          <Button
            key={provider}
            variant="outline"
            onClick={() => void connect(provider)}
            disabled={busy !== null}
            className="gap-2 rounded-full"
          >
            <CalendarCheck className="h-4 w-4" />
            {countByProvider[provider] ? "Add another" : "Connect"} {PROVIDER_LABELS[provider]}
          </Button>
        ))}
      </div>

      <AddFeedForm />
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center px-3 py-1.5 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

/**
 * What connecting a calendar means for your data, and the two full documents.
 *
 * Short on purpose. The full Terms and Privacy pages already exist and are
 * linked, not duplicated — copying their text in here would give the app two
 * places that can quietly say different things. This panel exists to answer
 * the one question specific to being *here*, on the calendar tab, which the
 * full policies do not lead with: what does connecting an account actually
 * hand over. The line already used above the connection list says it — this
 * just puts it where someone reaching for reassurance about a calendar is
 * already looking, instead of only at the very bottom of the page.
 */
function PolicyPanel() {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-4">
      <p className="text-sm text-ink-soft">
        Calendars connect read-only. grounded reads your events to show them alongside your tasks;
        it never edits, moves, or deletes anything at Google, Microsoft, or wherever a feed is
        published. Disconnecting a calendar removes it from grounded and changes nothing where it
        came from.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">
          Privacy policy
        </Link>
        <Link to="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms of use
        </Link>
      </div>
    </div>
  );
}

/**
 * Subscribe to a published .ics feed.
 *
 * Deliberately not an OAuth button. There is no consent screen and no token, so
 * nothing expires and nothing needs re-authorising weekly — which makes a feed
 * the most durable of the three sources, and the only one that works for a
 * university timetable or a fixtures list that was never going to hand out API
 * access.
 *
 * The URL is written straight to calendar_connections under the caller's own id
 * (RLS enforces that), then a sync is kicked off so a wrong URL fails here and
 * now rather than silently producing an empty calendar.
 */
function AddFeedForm() {
  const { user } = useSession();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    // webcal:// is the same feed over https and is how most sites publish it.
    const normalised = url.trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https:\/\/\S+$/i.test(normalised)) {
      toast.error("That doesn't look like a feed address", {
        description: "It should start with https:// or webcal:// and end in .ics.",
      });
      return;
    }

    setBusy(true);
    try {
      await actions.addCalendarFeed(normalised);
      setUrl("");
      toast.success("Feed subscribed", { description: "Pulling in events now." });
    } catch (err) {
      toast.error("Couldn't subscribe to that feed", {
        description: err instanceof Error ? err.message : "Check the address and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="space-y-2 border-t border-border pt-4">
      <label htmlFor="feed-url" className="text-sm font-medium">
        Or subscribe to a calendar feed
      </label>
      <p className="text-xs text-ink-soft">
        A published .ics address — a course timetable, a fixtures list, a shared family calendar.
        Read-only, and it never needs reconnecting.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <input
          id="feed-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.edu/timetable.ics"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <Button type="submit" disabled={busy || !url.trim()} className="rounded-full">
          {busy ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
    </form>
  );
}

function ConnectionRow({
  connection,
  busy,
  onReconnect,
}: {
  connection: CalendarConnection;
  busy: boolean;
  onReconnect: () => void;
}) {
  const needsReauth = connection.status === "needs_reauth";
  const errored = connection.status === "error";

  return (
    <li className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{PROVIDER_LABELS[connection.provider]}</div>
          {connection.accountEmail && (
            <div className="truncate text-xs text-ink-soft">{connection.accountEmail}</div>
          )}
          <div className="mt-1 text-xs text-ink-soft">
            Last synced {relativeTime(connection.lastSyncedAt)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => actions.disconnectCalendar(connection.id)}
          className="gap-1.5 rounded-full text-ink-soft"
        >
          <Unplug className="h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>

      {/* Reconnection is a routine event for Google, so it gets a plain
          explanation and a button rather than being buried in an error state. */}
      {needsReauth && (
        <div className="rounded-xl bg-secondary p-3 text-sm">
          <p>This calendar needs reconnecting before it can sync again.</p>
          <Button size="sm" onClick={onReconnect} disabled={busy} className="mt-2 rounded-full">
            Reconnect
          </Button>
        </div>
      )}

      {errored && (
        <p className="rounded-xl bg-secondary p-3 text-sm text-ink-soft">
          Last sync didn't finish. It'll try again on the next sync.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-soft">Events land in</span>
        {(Object.keys(AREA_META) as Area[]).map((area) => (
          <button
            key={area}
            disabled={busy}
            onClick={() => actions.setConnectionArea(connection.id, area)}
            className={`chip capitalize ${
              connection.defaultArea === area
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-ink-soft"
            }`}
          >
            {area}
          </button>
        ))}
      </div>
    </li>
  );
}
