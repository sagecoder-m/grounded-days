import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarCheck, RefreshCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { actions, AREA_META } from "@/lib/store";
import type { Area, CalendarConnection, CalendarProvider } from "@/lib/store-types";
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
    "Not connected. If you changed your mind, nothing happened. If Google said \u201caccess blocked\u201d, that account has not been added to the tester list yet \u2014 send it to whoever set up the pilot.",
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

export function CalendarConnectionsSection() {
  const { user } = useSession();
  const router = useRouter();
  // The OAuth callback redirects here with the outcome in the query string.
  const search = useSearch({ strict: false }) as { calendar?: string; reason?: string };
  const [busy, setBusy] = useState<string | null>(null);

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
      toast.error("Couldn't connect that calendar", {
        description: CONNECT_ERRORS[search.reason ?? ""] ?? "Please try again.",
      });
    }
    void router.navigate({ to: "/profile", replace: true, search: {} });
  }, [search.calendar, search.reason, router]);

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

  const rows = connections.data ?? [];
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
        Bring your real schedule alongside your tasks. Connect as many accounts as
        you like — several Google calendars, a work and a personal Outlook, any
        mix of the three. Everything comes in read-only; grounded never changes
        anything at the source.
      </p>

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              busy={busy !== null}
              onReconnect={() => void connect(connection.provider)}
            />
          ))}
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
              {countByProvider[provider] ? "Add another" : "Connect"}{" "}
              {PROVIDER_LABELS[provider]}
            </Button>
          ))}
      </div>

      <AddFeedForm />
    </section>
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
        A published .ics address — a course timetable, a fixtures list, a shared
        family calendar. Read-only, and it never needs reconnecting.
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
