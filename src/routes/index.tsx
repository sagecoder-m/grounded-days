import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { format, parseISO, addDays } from "date-fns";
import { actions, PINNED_WIDGETS, useAppState } from "@/lib/store";
import { waitingAWhile, WAITING_MIN } from "@/lib/user-insights";
import { TaskGrid, dateKey, dayRange } from "@/components/task-grid";
import { ReorderableSection, type DragState } from "@/components/reorderable-section";
import { TodayGlance } from "@/components/today-glance";
import { FocusTimer } from "@/components/focus-timer";
import { BoardCell } from "@/components/widget-frame";
import { useFlip } from "@/lib/use-flip";
import { RhythmGrid } from "@/components/rhythm-grid";
import { RhythmRiver } from "@/components/rhythm-river";
import { FirstThing, isNewAccount } from "@/components/first-thing";
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
    // The second line ("across N days...") went with the header notes. Dropping
    // the value too rather than computing a string nobody reads.
    if (completed === 0) return { headline: "A fresh fortnight" };
    return { headline: `${completed} ${completed === 1 ? "thing" : "things"} tended to` };
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
  const savedOrder = enabled.filter((k) => !PINNED_WIDGETS.has(k));

  /**
   * The order being shown while a drag is in progress.
   *
   * Reordering used to happen on release: until then a thin line marked where
   * the tile would land and nothing moved, which is what made dragging feel
   * dead. Now the order updates as the cursor passes over each tile, so the
   * board rearranges under your hand and you are looking at the result rather
   * than a promise of it.
   *
   * Local, not written through. actions.reorderWidgets is a database write, and
   * doing one per pointer move would be dozens of round trips for a single
   * gesture. The write happens once, on release.
   */
  const [preview, setPreview] = useState<string[] | null>(null);

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
  const orderedWidgets = preview ?? savedOrder;

  // Which section is being dragged and what it is hovering over. Held here
  // rather than per-section so one section can react to another being dragged
  // across it.
  const [drag, setDrag] = useState<DragState | null>(null);

  /*
    Animate the shuffle, keyed on the order alone.

    It used to watch a reflow counter as well, because under masonry a tile
    could travel without the order changing at all: ticking the last task off
    Today shortened that tile and dense packing pulled everything after it
    upward, between one frame and the next. With rows, a tile only moves when
    the order does — its row is where it is regardless of what its neighbours
    weigh — so the order string is once again the whole story.
  */
  useFlip(orderedWidgets.join(","), {
    selector: "[data-section]",
    idAttribute: "data-section",
    skipId: drag?.key ?? null,
  });

  /** Move `key` to where `over` currently sits, without touching anything else. */
  function reorderPreview(key: string, over: string) {
    setPreview((current) => {
      const order = [...(current ?? savedOrder)];
      const from = order.indexOf(key);
      const to = order.indexOf(over);
      if (from < 0 || to < 0 || from === to) return current;
      order.splice(to, 0, ...order.splice(from, 1));
      return order;
    });
  }

  /**
   * Write the arrangement, once.
   *
   * Rebuilt from the full saved list rather than from the preview, because the
   * preview only holds enabled, unpinned keys — hidden widgets and the pinned
   * header have to keep their entries or a drag would quietly delete them.
   */
  function commitPreview() {
    const order = preview;
    setPreview(null);
    setDrag(null);
    if (!order) return;
    const byKey = new Map(settings.widgets.map((w) => [w.key, w]));
    const moved = order.map((k) => byKey.get(k)).filter((w) => w !== undefined);
    const untouched = settings.widgets.filter((w) => !order.includes(w.key));
    actions.reorderWidgets([...untouched, ...moved]);
  }

  /** Ends a drag that finished outside any section, so nothing gets stuck — and
   *  keeps whatever arrangement the cursor had already produced. */
  const endDrag = () => commitPreview();

  if (oneThing) return <OneThing state={state} onClose={() => setOneThing(false)} />;

  if (isNewAccount(state) && !lookingAround) {
    return <FirstThing onLookAround={() => setLookingAround(true)} />;
  }

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
      actual board, which starts at roughly a 1016px window with the rail open
      and an 800px one with it collapsed.

      Six columns rather than two or three, because both halves and thirds have
      to divide evenly into it: a half is three columns and a third is two. With
      a 3-column grid there is no way to express "half", and with 2 there is no
      way to express "third".
    */
    <div className="@container/board min-w-0">
      {showBacklog && <WaitingAWhile tasks={waiting} onDismiss={() => setBacklogDismissed(true)} />}
      <div
        /*
          Rows, not masonry.

          This packed like masonry until the brief asked for the opposite —
          "everything should always fit to scale, ALWAYS ALIGNED". Masonry gave
          every tile exactly its own content's height and let column ends fall
          where they may, which reads as ragged rather than as a board.

          So: real rows, each as tall as the tallest tile in it, and every other
          tile in that row stretched to match (see FILL_ROW in widget-frame). The
          cost is the one masonry was avoiding — a timer beside a full day's
          list gets the list's height and some empty card with it — and that is
          the trade the brief asks for.

          Rows size to their own content, NOT auto-rows-fr. fr on implicit rows
          makes every row equal to the tallest one in the whole board, so a row
          holding one short chart was padded out to the height of the row
          holding a full day's task list — a screen of empty ground between two
          widgets, which is what "weird spacing" was.

          Not grid-flow-dense: dense reorders tiles to backfill gaps, which
          would silently undo the arrangement someone dragged.
        */
        className="board-grid grid items-stretch gap-6 @2xl/board:grid-cols-12"
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
            <BoardCell key={key} className="@container min-w-0 @2xl/board:col-span-12">
              {section}
            </BoardCell>
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
              onDragOver={reorderPreview}
              onDrop={commitPreview}
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

    if (key === "upcoming" && w("upcoming"))
      return (
        <section key={key}>
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
          />
        </section>
      );

    return null;
  }
}
