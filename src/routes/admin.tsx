/**
 * HQ — the admin portal for the pilot.
 *
 * Four panels, one per question a three-month test run has to answer:
 *   Pulse    — is the pilot healthy overall? (actives, retention, activation)
 *   Usage    — which sections earn use and which don't?
 *   Friction — where is the app breaking, and for whom is it breaking often?
 *   Accounts — who is in the pilot, and let the admin add testers directly.
 *
 * Privacy: everything here is computed from event names, routes and timestamps.
 * No journal text, task titles or any other content is collected anywhere in
 * the pipeline — see telemetry.ts and the hq_admin migration, which enforce
 * that shape rather than promising it.
 *
 * Gating: useIsAdmin() only decides what to render. The data itself is guarded
 * by RLS (telemetry tables are admin-select-only) and by the server-side admin
 * check inside the admin-accounts function, so a patched client gets errors,
 * not data.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RetentionHeatmap } from "@/components/hq-retention";
import type { ActivityWeek } from "@/lib/hq-analytics";
import { FeatureTrendChart } from "@/components/hq-feature-trend";
import { format, parseISO, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-is-admin";
import { dateKey } from "@/components/task-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "HQ — grounded" }] }),
  component: AdminPage,
});

const WINDOW_DAYS = 30;

/**
 * The cohort and trend panels need the whole pilot, not the last month.
 * Retention across the 3-5-10-10-10 onboarding waves is a ten-week-plus shape,
 * and "grew or declined over the pilot" needs two halves worth comparing.
 *
 * A separate window rather than widening WINDOW_DAYS, so Pulse, Usage and
 * Friction keep the 30-day framing they have always been read against.
 */
const PILOT_WINDOW_DAYS = 120;

/**
 * Row cap for the pilot-window query. Well above what ~40 testers generate over
 * four months, but if it is ever hit the data is silently truncated and both
 * charts would read too positive — so the panels are told, and they say so.
 */
const PILOT_ROW_LIMIT = 50000;

/** Route -> the section name humans use for it. */
const SECTION_LABELS: Record<string, string> = {
  "/": "Overview",
  "/calendar": "Calendar",
  "/assistant": "Assistant",
  "/journal": "Journal",
  "/personal": "Personal",
  "/professional": "Professional",
  "/education": "Education",
  "/profile": "Profile",
};

const EVENT_LABELS: Record<string, string> = {
  task_add: "Task added",
  task_toggle: "Task ticked",
  event_add: "Event added",
  event_move: "Event moved",
  habit_add: "Habit added",
  habit_toggle: "Habit ticked",
  goal_add: "Goal added",
  journal_entry_add: "Journal writing",
  assistant_message: "Assistant used",
  focus_session: "Focus session",
  share_link_create: "Share link made",
  share_link_copy: "Share link copied",
};

/** The pilot-window query selects less per row than UsageRow, since neither
 *  chart needs the route. */
interface PilotUsageRow {
  event: string;
  user_id: string;
  created_at: string;
}

interface UsageRow {
  event: string;
  route: string;
  user_id: string;
  created_at: string;
}

interface ErrorRow {
  id: number;
  message: string;
  stack: string | null;
  route: string;
  user_agent: string | null;
  created_at: string;
}

interface AccountRow {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

function AdminPage() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return <div className="card-soft h-40 animate-pulse rounded-2xl bg-secondary/60" />;
  }
  if (!isAdmin) {
    return (
      <div className="card-soft mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-2xl">Not this door</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This page is for the account running the pilot.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to overview
        </Link>
      </div>
    );
  }
  return <Portal />;
}

function Portal() {
  const since = useMemo(() => subDays(new Date(), WINDOW_DAYS).toISOString(), []);

  const events = useQuery({
    queryKey: ["hq-usage", since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("event, route, user_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return data as UsageRow[];
    },
  });

  const errors = useQuery({
    queryKey: ["hq-errors", since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_errors")
        .select("id, message, stack, route, user_agent, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as ErrorRow[];
    },
  });

  /* Same table and same admin-scoped SELECT policy as the 30-day query above —
     a wider date range, not a different access path. */
  const pilotSince = useMemo(() => subDays(new Date(), PILOT_WINDOW_DAYS).toISOString(), []);

  const pilotEvents = useQuery({
    queryKey: ["hq-pilot-usage", pilotSince],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("event, user_id, created_at")
        .gte("created_at", pilotSince)
        .order("created_at", { ascending: false })
        .limit(PILOT_ROW_LIMIT);
      if (error) throw error;
      return data as PilotUsageRow[];
    },
  });

  /**
   * Pre-telemetry activity, via the admin-only aggregate. Same is_admin() gate as
   * the SELECT policies above, enforced inside the function; it returns weeks and
   * user ids and nothing else.
   */
  const activityWeeks = useQuery({
    queryKey: ["hq-activity-weeks"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_activity_weeks");
      if (error) throw error;
      return (data ?? []) satisfies ActivityWeek[];
    },
  });

  const accounts = useQuery({
    queryKey: ["hq-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-accounts", {
        body: { action: "list" },
      });
      if (error) throw error;
      return (data as { users: AccountRow[] }).users;
    },
  });

  const pilotTruncated = (pilotEvents.data?.length ?? 0) >= PILOT_ROW_LIMIT;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        {/* HQ is reached from Profile and is not in the main nav, so without this
            the only way back is the browser's own back button. */}
        <Link
          to="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
        <h1 className="font-serif text-2xl md:text-3xl">HQ</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          The pilot at a glance — last {WINDOW_DAYS} days. Counts of feature names and timestamps
          only; nothing anyone wrote is collected or shown here.
        </p>
      </header>

      <PulsePanel events={events.data} accounts={accounts.data} errors={errors.data} />
      <UsagePanel events={events.data} loading={events.isLoading} />

      {/* Both pilot-window panels together, so retention and the cut/keep call
          are read side by side rather than on separate screens. */}
      <RetentionHeatmap
        accounts={accounts.data}
        events={pilotEvents.data}
        backfill={activityWeeks.data}
        loading={pilotEvents.isLoading || accounts.isLoading || activityWeeks.isLoading}
        truncated={pilotTruncated}
      />
      <FeatureTrendChart
        events={pilotEvents.data}
        loading={pilotEvents.isLoading}
        windowDays={PILOT_WINDOW_DAYS}
        truncated={pilotTruncated}
      />
      <FrictionPanel errors={errors.data} events={events.data} loading={errors.isLoading} />
      <AccountsPanel
        accounts={accounts.data}
        loading={accounts.isLoading}
        error={accounts.isError}
      />
      <PilotChecklist />
    </div>
  );
}

// --------------------------------------------------------------------- pulse

function PulsePanel({
  events,
  accounts,
  errors,
}: {
  events?: UsageRow[];
  accounts?: AccountRow[];
  errors?: ErrorRow[];
}) {
  const stats = useMemo(() => {
    if (!events) return null;
    const now = Date.now();
    const wk = 7 * 24 * 3600_000;

    const activeThisWeek = new Set(
      events.filter((e) => now - Date.parse(e.created_at) < wk).map((e) => e.user_id),
    );
    const activeLastWeek = new Set(
      events
        .filter((e) => {
          const age = now - Date.parse(e.created_at);
          return age >= wk && age < 2 * wk;
        })
        .map((e) => e.user_id),
    );
    const returned = [...activeLastWeek].filter((u) => activeThisWeek.has(u)).length;
    const retention =
      activeLastWeek.size > 0 ? Math.round((returned / activeLastWeek.size) * 100) : null;

    // Activation: of accounts old enough to judge (created >24h ago), how many
    // ever did something beyond looking — any non-page_view event.
    let activation: number | null = null;
    if (accounts) {
      const judgeable = accounts.filter((a) => now - Date.parse(a.createdAt) > 24 * 3600_000);
      const doers = new Set(events.filter((e) => e.event !== "page_view").map((e) => e.user_id));
      activation =
        judgeable.length > 0
          ? Math.round((judgeable.filter((a) => doers.has(a.id)).length / judgeable.length) * 100)
          : null;
    }

    const errorsThisWeek = (errors ?? []).filter((e) => now - Date.parse(e.created_at) < wk).length;

    return {
      accounts: accounts?.length ?? null,
      newThisWeek: accounts?.filter((a) => now - Date.parse(a.createdAt) < wk).length ?? null,
      activeThisWeek: activeThisWeek.size,
      retention,
      activation,
      errorsThisWeek,
    };
  }, [events, accounts, errors]);

  const tiles: { label: string; value: string; hint: string }[] = stats
    ? [
        {
          label: "Accounts",
          value: stats.accounts === null ? "—" : String(stats.accounts),
          hint: stats.newThisWeek === null ? "" : `${stats.newThisWeek} new this week`,
        },
        {
          label: "Active this week",
          value: String(stats.activeThisWeek),
          hint: "signed in and did anything",
        },
        {
          label: "Retention",
          value: stats.retention === null ? "—" : `${stats.retention}%`,
          hint: "of last week's actives came back",
        },
        {
          label: "Activation",
          value: stats.activation === null ? "—" : `${stats.activation}%`,
          hint: "of accounts did more than look",
        },
        {
          label: "Errors this week",
          value: String(stats.errorsThisWeek),
          hint: "client-side crashes reported",
        },
      ]
    : [];

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg">Pulse</h2>
      {!stats ? (
        <div className="card-soft h-24 animate-pulse rounded-2xl bg-secondary/60" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="card-soft p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-ink-soft">{t.label}</div>
              <div className="mt-1 font-serif text-3xl">{t.value}</div>
              {t.hint && <div className="mt-1 text-[11px] text-ink-soft">{t.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------- usage

function UsagePanel({ events, loading }: { events?: UsageRow[]; loading: boolean }) {
  const sections = useMemo(() => {
    if (!events) return [];
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.event !== "page_view") continue;
      const label = SECTION_LABELS[e.route];
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // Every section always appears, so "least used" is visible as a short bar
    // rather than an absence nobody notices.
    return Object.values(SECTION_LABELS)
      .map((label) => ({ label, visits: counts.get(label) ?? 0 }))
      .sort((a, b) => b.visits - a.visits);
  }, [events]);

  const features = useMemo(() => {
    if (!events) return [];
    const counts = new Map<string, number>();
    for (const e of events) {
      const label = EVENT_LABELS[e.event];
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Object.values(EVENT_LABELS)
      .map((label) => ({ label, uses: counts.get(label) ?? 0 }))
      .sort((a, b) => b.uses - a.uses);
  }, [events]);

  const most = sections[0];
  const least = sections[sections.length - 1];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Usage</h2>
        {most && least && most.visits > 0 && (
          <span className="text-xs text-ink-soft">
            most: {most.label} · least: {least.label}
          </span>
        )}
      </div>
      {loading ? (
        <div className="card-soft h-56 animate-pulse rounded-2xl bg-secondary/60" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-soft p-4 md:p-6">
            <h3 className="mb-3 text-sm text-ink-soft">Section visits</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={sections} layout="vertical" margin={{ left: 24, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={10}
                    stroke="var(--ink-soft)"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    fontSize={11}
                    stroke="var(--ink-soft)"
                    width={82}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="visits" fill="var(--sage)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-soft p-4 md:p-6">
            <h3 className="mb-3 text-sm text-ink-soft">Feature use</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={features} layout="vertical" margin={{ left: 24, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={10}
                    stroke="var(--ink-soft)"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    fontSize={11}
                    stroke="var(--ink-soft)"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="uses" fill="var(--clay)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ friction

function FrictionPanel({
  errors,
  events,
  loading,
}: {
  errors?: ErrorRow[];
  events?: UsageRow[];
  loading: boolean;
}) {
  const grouped = useMemo(() => {
    if (!errors) return [];
    const map = new Map<
      string,
      { message: string; route: string; count: number; latest: ErrorRow }
    >();
    for (const err of errors) {
      const key = `${err.route}::${err.message}`;
      const entry = map.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        map.set(key, { message: err.message, route: err.route, count: 1, latest: err });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [errors]);

  const errorRate = useMemo(() => {
    if (!errors || !events || events.length === 0) return null;
    return ((errors.length / events.length) * 1000).toFixed(1);
  }, [errors, events]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Friction</h2>
        {errorRate !== null && (
          <span className="text-xs text-ink-soft">{errorRate} errors per 1k events</span>
        )}
      </div>
      {loading ? (
        <div className="card-soft h-24 animate-pulse rounded-2xl bg-secondary/60" />
      ) : grouped.length === 0 ? (
        <div className="card-soft p-6 text-center text-sm italic text-ink-soft">
          No client errors in the window. Keep it that way.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => (
            <details
              key={`${g.route}::${g.message}`}
              className="rounded-2xl border border-border bg-card px-4 py-3"
            >
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{g.message}</span>
                <span className="ml-2 text-[11px] text-ink-soft">
                  {g.route} · {g.count}× · last{" "}
                  {format(parseISO(g.latest.created_at), "MMM d, h:mm a")}
                </span>
              </summary>
              {g.latest.stack && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-secondary/60 p-3 text-[11px] leading-relaxed">
                  {g.latest.stack}
                </pre>
              )}
              {g.latest.user_agent && (
                <p className="mt-2 text-[11px] text-ink-soft">{g.latest.user_agent}</p>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ accounts

function AccountsPanel({
  accounts,
  loading,
  error,
}: {
  accounts?: AccountRow[];
  loading: boolean;
  error: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-lg">Accounts</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="card-soft overflow-x-auto p-4 md:p-6">
          {loading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-secondary/60" />
          ) : error ? (
            <p className="text-sm text-ink-soft">
              Could not load accounts — the admin-accounts function may not be deployed yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                  <th className="pb-2 pr-4 font-normal">Email</th>
                  <th className="pb-2 pr-4 font-normal">Joined</th>
                  <th className="pb-2 font-normal">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {(accounts ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2 pr-4">{a.email ?? "—"}</td>
                    <td suppressHydrationWarning className="py-2 pr-4 text-ink-soft">
                      {format(parseISO(a.createdAt), "MMM d, yyyy")}
                    </td>
                    <td suppressHydrationWarning className="py-2 text-ink-soft">
                      {a.lastSignInAt ? format(parseISO(a.lastSignInAt), "MMM d, h:mm a") : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <CreateAccountCard />
      </div>
    </section>
  );
}

function suggestPassword() {
  // Readable enough to hand to a tester on a call, random enough to be safe as
  // a first password they will change.
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, "")
    .slice(0, 12);
}

/**
 * Clipboard write with a spoken result.
 *
 * Silence after a copy is indistinguishable from failure, and the failure is
 * real: clipboard access is refused in some mobile browsers and over plain
 * http. When it does fail the value is still on screen and selectable, so the
 * message says that rather than leaving a dead end.
 */
async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  } catch {
    toast.error("Couldn't copy", { description: "Select the text and copy it manually." });
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-ink-soft">{label}</span>
      {/* min-w-0 so a long value truncates instead of pushing the button out of
          the card, and select-all keeps manual copying available. */}
      <code className="min-w-0 flex-1 select-all truncate font-mono">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => void copyText(value, `${label} copied`)}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CreateAccountCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-accounts", {
        body: { action: "create", email, password },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setCreated({ email, password });
      toast.success("Account created");
      setEmail("");
      setPassword(suggestPassword());
    } catch (err) {
      toast.error("Couldn't create the account", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-soft space-y-4 p-4 md:p-6">
      <h3 className="text-sm text-ink-soft">Add a tester</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>First password</Label>
          <Input
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full rounded-full">
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
      {created && (
        <div className="rounded-2xl border border-dashed border-tan bg-secondary/60 p-3 text-xs">
          <p className="font-medium">Hand these to the tester:</p>

          {/* Selectable text was the whole handoff, which means selecting a
              12-character password by hand and hoping you got the edges. These
              are shown once and never recoverable, so a mis-copy costs the
              tester their account — worth a button. */}
          <div className="mt-2 space-y-1.5">
            <CopyRow label="Email" value={created.email} />
            <CopyRow label="Password" value={created.password} />
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-2.5 h-8 w-full rounded-full border-tan text-xs"
            onClick={() =>
              void copyText(`Email: ${created.email}\nPassword: ${created.password}`, "Both copied")
            }
          >
            <Copy className="h-3.5 w-3.5" /> Copy both
          </Button>

          <p className="mt-2 text-ink-soft">
            Shown once — it isn&rsquo;t stored anywhere you can read it back.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- pilot

/**
 * The weekly ritual, written down so a busy week cannot quietly skip it. Static
 * on purpose: a checklist that edits itself is a dashboard, and the dashboard
 * is above.
 */
function PilotChecklist() {
  const items = [
    "Retention is the pilot's verdict — if last week's actives stop returning, ask five of them why before changing anything.",
    "Activation below ~60% usually means onboarding, not features: watch what brand-new accounts do in their first session.",
    "One section at the bottom of Usage for three straight weeks is a candidate to cut or rethink — shipping less is a valid outcome.",
    "Any error appearing for more than one user is a bug to fix this week, not a ticket to file.",
    "Ask testers where they got stuck, not what they want added. Requests describe their old tools; stuck-points describe this one.",
  ];
  return (
    <section>
      <h2 className="mb-3 font-serif text-lg">Running the pilot</h2>
      <div className="card-soft p-4 md:p-6">
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[color:var(--sage)]">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
