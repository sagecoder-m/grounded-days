import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { actions, useAppState } from "@/lib/store";
import type { Settings } from "@/lib/store-types";
import { waitingAWhile, WAITING_MIN } from "@/lib/user-insights";
import { TaskGrid } from "@/components/task-grid";
import { dateKey, dayRange } from "@/lib/dates";
import { TodayGlance } from "@/components/today-glance";
import { AgendaWidget } from "@/components/agenda-widget";
import { FocusTimer } from "@/components/focus-timer";
import { DashboardCanvas } from "@/components/dashboard/dashboard-canvas";
import { AddWidgetMenu } from "@/components/dashboard/add-widget";
import { widgetSpec } from "@/components/dashboard/widget-registry";
import { placeBelow } from "@/components/dashboard/layout-engine";
import { DEFAULT_WIDGETS } from "@/lib/store";
import { RhythmGrid } from "@/components/rhythm-grid";
import { RhythmRiver } from "@/components/rhythm-river";
import { FirstThing } from "@/components/first-thing";
import { isNewAccount } from "@/lib/user-insights";
import { WaitingAWhile } from "@/components/waiting-a-while";
import { OneThing } from "@/components/one-thing";
import { AreaBalance } from "@/components/area-balance";
import { MovementCards } from "@/components/movement-cards";
import { SoftProgress } from "@/components/soft-progress";
import { AreaChip } from "@/components/area-chip";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Area as RArea,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/")({
  component: Overview,
});

/** How far "Upcoming" looks ahead, in days after today. Three is about as much
 *  as reads as "soon" rather than as a backlog. */
const UPCOMING_DAYS = 3;

function greeting(name: string) {
  const h = new Date().getHours();
  const g =
    h < 5
      ? "Rest well"
      : h < 12
        ? "Good morning"
        : h < 17
          ? "Good afternoon"
          : h < 21
            ? "Good evening"
            : "Winding down";
  return `${g}, ${name}`;
}

function Overview() {
  const state = useAppState();
  const today = new Date();
  /*
    The day, as a stable value the memos below can depend on.

    `today` is a fresh Date on every render, so listing it as a dependency
    defeats the memo entirely — which is why it was omitted, and why the chart
    then never noticed midnight passing. A yyyy-MM-dd string changes exactly
    once a day, which is when these actually need recomputing.
  */
  const todayKey = dateKey(today);

  const areaProgress = useMemo(() => {
    const areas = ["personal", "professional", "education"] as const;
    return areas.map((a) => {
      const gs = state.goals.filter((g) => g.area === a);
      const avg = gs.length ? Math.round(gs.reduce((s, g) => s + g.progress, 0) / gs.length) : 0;
      return { area: a, value: avg };
    });
  }, [state.goals]);

  /** The three days after today. Today has its own section, so repeating it
   *  here would show the same task twice on one screen. */
  const upcomingRange = useMemo(() => dayRange(UPCOMING_DAYS, 1), []);
  // Weekly area chart: aggregate completed tasks per day per area over last 14d
  const chartData = useMemo(() => {
    // dateKey, not toISOString: the latter converts to UTC first, so an evening
    // in a western timezone produced tomorrow's key and the chart attributed
    // completed work to the wrong bar.
    // Derived from todayKey rather than `today`, so this really is a function
    // of its dependencies.
    const base = parseISO(todayKey);
    const days = Array.from({ length: 14 }, (_, i) => dateKey(addDays(base, -13 + i)));
    return days.map((d) => {
      const dObj = parseISO(d);
      const personal =
        state.tasks.filter((t) => t.area === "personal" && t.done && t.date === d).length +
        state.habits.reduce((s, h) => s + (h.log[d] ? 1 : 0), 0);
      const professional = state.tasks.filter(
        (t) => t.area === "professional" && t.done && t.date === d,
      ).length;
      const education = state.tasks.filter(
        (t) => t.area === "education" && t.done && t.date === d,
      ).length;
      return { day: format(dObj, "MMM d"), personal, professional, education };
    });
  }, [state.tasks, state.habits, todayKey]);

  /**
   * The chart's headline. It leads the Overview, so it reports what has been
   * done rather than what is outstanding — the number is the same either way,
   * but "23 things tended to" is a different message from "6 tasks left".
   */
  const encouragement = useMemo(() => {
    const completed = chartData.reduce(
      (sum, d) => sum + d.personal + d.professional + d.education,
      0,
    );
    // The second line ("across N days...") went with the header notes. Dropping
    // the value too rather than computing a string nobody reads.
    if (completed === 0) return { headline: "A fresh fortnight" };
    return { headline: `${completed} ${completed === 1 ? "thing" : "things"} tended to` };
  }, [chartData]);

  const settings = state.settings;
  const w = (k: string) => settings.widgets.find((x) => x.key === k)?.enabled ?? true;
  /**
   * Whether someone with an empty account has asked to see the board anyway.
   *
   * Session-only and deliberately not persisted: by their next visit they will
   * almost certainly have added something, and storing a flag for a state that
   * resolves itself is a setting nobody will ever knowingly change.
   */
  const [lookingAround, setLookingAround] = useState(false);

  /** Whether the one-at-a-time screen is up. Never persisted: it is a way of
   *  working through a particular afternoon, not a mode to be left switched on. */
  const [oneThing, setOneThing] = useState(false);

  /**
   * The backlog offer, and whether it has been waved away this session.
   *
   * Session-only on purpose. Persisting a dismissal would mean the pile can be
   * silenced permanently and then quietly grow, and the offer is only ever three
   * buttons at the top of a page — cheap to ignore again.
   */
  const [backlogDismissed, setBacklogDismissed] = useState(false);
  const waiting = useMemo(() => waitingAWhile(state), [state]);
  const showBacklog = !backlogDismissed && waiting.length >= WAITING_MIN;

  /**
   * Save an arrangement, once, when a gesture ends.
   *
   * The canvas moves tiles on every pointer frame and keeps that to itself;
   * this is called on release. Writing mid-drag would be hundreds of round
   * trips for one gesture, and round-tripping through React would put the tile
   * behind the cursor.
   */
  const persistLayout = useCallback((next: Settings["widgets"]) => {
    actions.reorderWidgets(next);
  }, []);

  const removeWidget = useCallback(
    (key: string) => {
      actions.reorderWidgets(
        settings.widgets.map((w) => (w.key === key ? { ...w, enabled: false } : w)),
      );
    },
    [settings.widgets],
  );

  /**
   * Put every widget back where it started, keeping which ones are on.
   *
   * Positions only. Which widgets someone wants on their board is a separate
   * decision from where they ended up sitting, and a reset that silently
   * switched things back on would be undoing a choice nobody asked to undo.
   */
  const resetLayout = useCallback(() => {
    const enabledByKey = new Map(settings.widgets.map((w) => [w.key, w.enabled]));
    actions.reorderWidgets(
      DEFAULT_WIDGETS.map((d) => ({ ...d, enabled: enabledByKey.get(d.key) ?? d.enabled })),
    );
  }, [settings.widgets]);

  /** Puts a widget back on the board, below everything already placed. */
  const addWidget = useCallback(
    (key: string) => {
      const spec = widgetSpec(key);
      if (!spec) return;
      const spot = placeBelow(settings.widgets, spec.preferred.w, spec.preferred.h);
      actions.reorderWidgets(
        settings.widgets.map((w) => (w.key === key ? { ...w, enabled: true, ...spot } : w)),
      );
    },
    [settings.widgets],
  );

  if (oneThing) return <OneThing state={state} onClose={() => setOneThing(false)} />;

  if (isNewAccount(state) && !lookingAround) {
    return <FirstThing onLookAround={() => setLookingAround(true)} />;
  }

  return (
    <div className="min-w-0">
      {showBacklog && <WaitingAWhile tasks={waiting} onDismiss={() => setBacklogDismissed(true)} />}

      <div className="mb-3 flex items-center justify-end">
        <AddWidgetMenu placements={settings.widgets} onAdd={addWidget} onReset={resetLayout} />
      </div>

      {/*
        The board. Everything about where a tile sits and how big it is lives in
        settings.widgets as x/y/w/h, and the canvas is the only thing that reads
        or writes it — this component just says which widget draws what.
      */}
      <DashboardCanvas
        placements={settings.widgets}
        onPersist={persistLayout}
        onRemove={removeWidget}
        render={renderSection}
      />
    </div>
  );

  function renderSection(key: string) {
    if (key === "greeting" && w("greeting"))
      return (
        <section key={key}>
          <p suppressHydrationWarning className="text-sm text-ink-soft">
            {format(today, "EEEE, MMMM d, yyyy")}
          </p>
          <h1 suppressHydrationWarning className="mt-1 font-serif text-2xl md:text-3xl">
            {greeting(settings.displayName || "friend")}
          </h1>
          <p className="mt-2 text-ink-soft max-w-lg">
            Take a breath. Here's your gentle rundown for today — one small thing at a time.
          </p>
        </section>
      );

    if (key === "goals" && w("goals"))
      return (
        <section key={key}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-lg">How your areas are moving</h2>
          </div>
          {/*
            Three across when the widget is wide enough to read them, stacked
            when it is not. @xl is 36rem — below that, three cards come out
            around 110px each and the percentage collides with the area name.

            The timer used to sit at the end of this row, which forced every card
            to match its height. It is its own widget now, so these are back to
            being as tall as their contents.
          */}
          <div className="grid gap-3 @xl:grid-cols-3">
            {areaProgress.map((a) => (
              <div key={a.area} className="card-soft density-p flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <AreaChip area={a.area} />
                  <span className="font-serif text-xl tabular-nums">{a.value}%</span>
                </div>
                <SoftProgress
                  value={a.value}
                  tint={
                    a.area === "personal" ? "sage" : a.area === "professional" ? "brown" : "clay"
                  }
                />
              </div>
            ))}
          </div>
        </section>
      );

    if (key === "focus" && w("focus"))
      return (
        <section key={key}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-lg">Focus</h2>
          </div>
          <FocusTimer size="widget" />
        </section>
      );

    if (key === "day" && w("day"))
      return (
        <section key={key}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">A look at today</h2>
            {/* Deliberately here rather than in the nav: another tab would be one
                more thing to choose between, which is the problem this exists to
                answer. It sits next to the list it rescues you from. */}
            {state.tasks.some((t) => !t.done) && (
              <button
                type="button"
                onClick={() => setOneThing(true)}
                className="shrink-0 text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
              >
                Just one thing
              </button>
            )}
          </div>
          <TodayGlance />
        </section>
      );

    if (key === "chart" && w("chart"))
      return (
        <section key={key}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">{encouragement.headline}</h2>
          </div>
          <div className="card-soft p-4 md:p-6">
            <div className="grid gap-6 @3xl:grid-cols-[2fr_1fr]">
              <div className="h-56">
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gs" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--sage)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--sage)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gb" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--brown)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--brown)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gc" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--clay)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--clay)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      fontSize={10}
                      stroke="var(--ink-soft)"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      fontSize={10}
                      stroke="var(--ink-soft)"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <RArea
                      type="monotone"
                      dataKey="personal"
                      stroke="var(--sage)"
                      fill="url(#gs)"
                      strokeWidth={2}
                    />
                    <RArea
                      type="monotone"
                      dataKey="professional"
                      stroke="var(--brown)"
                      fill="url(#gb)"
                      strokeWidth={2}
                    />
                    <RArea
                      type="monotone"
                      dataKey="education"
                      stroke="var(--clay)"
                      fill="url(#gc)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="hidden h-56 @3xl:block">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={areaProgress.map((a) => ({
                        name: a.area,
                        value: Math.max(a.value, 5),
                      }))}
                      dataKey="value"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      stroke="var(--card)"
                      strokeWidth={3}
                    >
                      <Cell fill="var(--sage)" />
                      <Cell fill="var(--brown)" />
                      <Cell fill="var(--clay)" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      );

    if (key === "river" && w("river")) return <RhythmRiver key={key} state={state} />;
    if (key === "rhythm" && w("rhythm")) return <RhythmGrid key={key} state={state} />;
    if (key === "balance" && w("balance")) return <AreaBalance key={key} state={state} />;
    if (key === "movement" && w("movement")) return <MovementCards key={key} state={state} />;

    if (key === "agenda" && w("agenda"))
      return (
        <section key={key} className="flex h-full min-h-0 flex-col">
          <AgendaWidget />
        </section>
      );

    if (key === "upcoming" && w("upcoming"))
      return (
        <section key={key} className="flex h-full min-h-0 flex-col">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">Upcoming</h2>
          </div>
          {/* The three days after today — today has its own section above,
                  and repeating it here read as twice the work. Same grid, so
                  the two sections are one list split by time rather than two
                  designs. */}
          {/* No card. It had one for a while, to make it match its neighbours,
              and the matching was the wrong kind: a panel with rows inside reads
              as a container of things and the rows stop being things. Today has
              been brought to this shape rather than the other way round. */}
          <TaskGrid
            tasks={state.tasks}
            events={state.events}
            from={upcomingRange.from}
            to={upcomingRange.to}
            emptyText="Nothing in the next few days."
            floating
            fit
          />
        </section>
      );

    return null;
  }
}
