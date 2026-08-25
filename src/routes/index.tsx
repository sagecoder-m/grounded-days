import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { PINNED_WIDGETS, useAppState } from "@/lib/store";
import { TaskGrid, dateKey, dayRange } from "@/components/task-grid";
import { ReorderableSection, type DragState } from "@/components/reorderable-section";
import { TodayGlance } from "@/components/today-glance";
import { FocusTimer } from "@/components/focus-timer";
import { RhythmGrid } from "@/components/rhythm-grid";
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
  const upcomingLabel = useMemo(
    () =>
      `${format(parseISO(upcomingRange.from), "EEE, MMM d")} – ${format(
        parseISO(upcomingRange.to),
        "EEE, MMM d",
      )}`,
    [upcomingRange],
  );

  // Weekly area chart: aggregate completed tasks per day per area over last 14d
  const chartData = useMemo(() => {
    // dateKey, not toISOString: the latter converts to UTC first, so an evening
    // in a western timezone produced tomorrow's key and the chart attributed
    // completed work to the wrong bar.
    const days = Array.from({ length: 14 }, (_, i) => dateKey(addDays(today, -13 + i)));
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
  }, [state.tasks, state.habits]);

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
    const activeDays = chartData.filter(
      (d) => d.personal + d.professional + d.education > 0,
    ).length;

    if (completed === 0) {
      return {
        headline: "A fresh fortnight",
        sub: "Nothing logged yet — the first small thing counts.",
      };
    }
    return {
      headline: `${completed} ${completed === 1 ? "thing" : "things"} tended to`,
      sub: `across ${activeDays} ${activeDays === 1 ? "day" : "days"} in the last two weeks`,
    };
  }, [chartData]);

  const settings = state.settings;
  const w = (k: string) => settings.widgets.find((x) => x.key === k)?.enabled ?? true;
  /**
   * Pinned widgets first, in their own fixed order, then everything else in
   * whatever order the person arranged.
   *
   * Partitioned here rather than relying on the saved array, so a drag that
   * happens to land at index 0 cannot push the header down the page. The saved
   * order for a pinned key is simply never consulted.
   */
  const enabled = settings.widgets.filter((x) => x.enabled).map((x) => x.key);
  const pinnedWidgets = enabled.filter((k) => PINNED_WIDGETS.has(k));
  const orderedWidgets = enabled.filter((k) => !PINNED_WIDGETS.has(k));

  // Which section is being dragged and what it is hovering over. Held here
  // rather than per-section so one section can react to another being dragged
  // across it.
  const [drag, setDrag] = useState<DragState | null>(null);

  /** Ends a drag that finished outside any section, so nothing gets stuck. */
  const endDrag = () => setDrag(null);

  return (
    /*
      A two-column grid rather than a stack, so a widget's shape is the person's
      choice as well as its order. auto-rows-min keeps each row only as tall as
      it needs, and grid-flow-dense lets a half-width widget fill the gap beside
      an earlier one instead of leaving a hole.

      The columns are keyed to the board's own width, not the window's. This was
      lg:grid-cols-2 — a 1024px *window* — which meant that on any narrower
      window every size collapsed to one column and choosing "Half width" did
      nothing at all: the menu took the choice and the layout ignored it. The
      window is the wrong thing to measure anyway, since the side rail can be
      expanded or collapsed and takes 280px when it is open. @2xl is 42rem of
      actual board — two ~324px columns, which start at roughly a 1016px window
      with the rail open and an 800px one with it collapsed.
    */
    <div className="@container/board">
      <div
        className="grid grid-flow-row-dense auto-rows-min gap-6 @2xl/board:grid-cols-2"
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* Furniture: full width, no handle, no size menu, nothing to drop on.
            Rendered outside ReorderableSection so it carries no data-section
            attribute and therefore cannot be a drag target at all. */}
        {pinnedWidgets.map((key) => {
          const section = renderSection(key);
          if (!section) return null;
          return (
            <div key={key} className="@container @2xl/board:col-span-2">
              {section}
            </div>
          );
        })}

        {orderedWidgets.map((key) => {
          const section = renderSection(key);
          if (!section) return null;
          return (
            <ReorderableSection
              key={key}
              sectionKey={key}
              widgets={settings.widgets}
              drag={drag}
              setDrag={setDrag}
            >
              {section}
            </ReorderableSection>
          );
        })}
      </div>
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
            <span className="text-xs italic text-ink-soft">One block at a time.</span>
          </div>
          <FocusTimer size="widget" />
        </section>
      );

    if (key === "day" && w("day"))
      return (
        <section key={key}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-lg">A look at today</h2>
            {/* HTML entity, not a unicode escape: in a JSX text child a
                    backslash-u sequence is not an escape at all, just six
                    literal characters, and it was rendering as written. */}
            <span className="text-xs text-ink-soft">Just today&rsquo;s scope</span>
          </div>
          <TodayGlance />
        </section>
      );

    if (key === "chart" && w("chart"))
      return (
        <section key={key}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">{encouragement.headline}</h2>
            <span className="text-xs text-ink-soft">{encouragement.sub}</span>
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

    if (key === "rhythm" && w("rhythm")) return <RhythmGrid key={key} state={state} />;
    if (key === "balance" && w("balance")) return <AreaBalance key={key} state={state} />;
    if (key === "movement" && w("movement")) return <MovementCards key={key} state={state} />;

    if (key === "upcoming" && w("upcoming"))
      return (
        <section key={key}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">Upcoming</h2>
            <span suppressHydrationWarning className="text-xs text-ink-soft">
              {upcomingLabel}
            </span>
          </div>
          {/* The three days after today — today has its own section above,
                  and repeating it here read as twice the work. Same grid, so
                  the two sections are one list split by time rather than two
                  designs. */}
          <TaskGrid
            tasks={state.tasks}
            events={state.events}
            from={upcomingRange.from}
            to={upcomingRange.to}
            emptyText="Nothing in the next few days."
          />
        </section>
      );

    return null;
  }
}
