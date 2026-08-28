import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { actions, useAppState } from "@/lib/store";
import type { Goal, Habit, Task } from "@/lib/store-types";
import { HowFarYouveCome } from "@/components/how-far";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { dateKey } from "@/components/task-grid";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { ReorderableCard, useCardDrag } from "@/components/reorderable-card";
import { SoftProgress } from "@/components/soft-progress";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import { toast } from "sonner";
import { InlineText } from "@/components/inline-text";
import { AreaEvents } from "@/components/area-events";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/personal")({
  component: PersonalPage,
});

function PersonalPage() {
  const state = useAppState();
  const personalGoals = state.goals.filter((g) => g.area === "personal");
  const personalTasks = state.tasks
    .filter((t) => t.area === "personal")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  /*
    Ticking something off does not make it disappear from under your hand.

    A task crossed out at nine in the morning stays in the list all day, struck
    through, and only moves to the look-back tomorrow. Two reasons, and the
    second is the real one: a list that empties itself as you work erases the
    evidence that you worked, and — worse — a line that vanishes the instant you
    tick it makes an accidental tick unrecoverable without going to find it
    somewhere else.

    "Today" is by when it was last changed, which for a finished task is when it
    was finished. Personal has no projects any more, so nothing is filed away
    out of sight and every open task belongs in this one list.
  */
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const finishedToday = (t: Task) => t.done && t.updatedAt >= startOfToday.getTime();

  const looseTasks = personalTasks.filter((t) => !t.done || finishedToday(t));
  const doneTasks = personalTasks
    .filter((t) => t.done && !finishedToday(t))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const today = new Date();
  /**
   * The current week, starting on whichever day the profile says.
   *
   * This used to be `addDays(today, -6 + i)` — the last seven days ending today,
   * which is a rolling window and not a week. On a Monday it rendered T W T F S
   * S M, and any given habit moved a column to the left every day, so nothing
   * could be read as "this week".
   */
  const days = useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn: state.settings.weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [state.settings.weekStartsOn, dateKey(today)]);

  const [newHabit, setNewHabit] = useState("");
  const goalDrag = useCardDrag();
  // The habit grid keys off today's date, so it stays a skeleton until mount.
  const mounted = useMounted();

  /*
    Habits completed per day, and nothing else.

    There was a second line here for average goal progress, and it was not a
    history: the same number — today's average — was plotted against all
    twenty-one days, so it drew a perfectly flat line that looked like evidence
    of total consistency and was actually evidence of nothing. It also ran 0–100
    against a series that runs 0–4, which flattened the real line along the
    bottom of the chart.

    Goal progress has no per-day record to draw, so the honest chart is the one
    series that does.
  */
  const chartData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = addDays(today, -20 + i);
      const iso = dateKey(d);
      const completed = state.habits.reduce((s, h) => s + (h.log[iso] ? 1 : 0), 0);
      return { day: format(d, "M/d"), habits: completed };
    });
  }, [state.habits]);

  return (
    <div className="space-y-10">
      <header>
        <p
          className="chip bg-sage-soft text-[color:var(--sage-deep)]"
          style={{ backgroundColor: "var(--sage-soft)", color: "var(--sage-deep)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--sage)" }} />{" "}
          Personal
        </p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Tend to yourself</h1>
        <p className="mt-2 text-ink-soft max-w-lg">
          Small, repeatable acts of care. No streaks to break — just gentle dots.
        </p>
      </header>

      {/*
        Consistency first, then habits beside goals.

        The brief asks for one page you can take in without scrolling — "1 page,
        zoom" — and for goals to sit next to daily habits rather than below
        them, because the point being made is that they are the same effort seen
        at two scales. The chart leads because it is the only part that answers
        "how has this been going" rather than "what is there to do".
      */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-lg">Consistency, over time</h2>
        </div>
        <div className="card-soft p-4 md:p-6 h-56">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="habits"
                stroke="var(--sage)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--sage)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* One series needs a caption, not a legend. */}
        <p className="mt-2 text-xs text-ink-soft">Habits completed, day by day.</p>
      </section>

      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* The left track: habits, and the tasks that sit under them. */}
        <div className="space-y-8">
          {/* Habits */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif text-lg">Daily habits</h2>
            </div>
            <div className="card-soft p-4 md:p-6">
              {!mounted ? (
                <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
              ) : (
                <>
                  {/* Wide screens: one header row across the whole table. The
                  transparent border, matching padding and fixed-width spacer
                  mirror the habit cards' horizontal box exactly — same trick
                  the narrow header below uses. Without them the cards' px-3,
                  1px border and 24px delete button made the day columns start
                  50px further left than the header's, so every letter floated
                  37px right of its dots. */}
                  <div className="mb-2 hidden grid-cols-[1fr_repeat(7,minmax(0,44px))_auto] gap-2 rounded-2xl border border-transparent px-3 text-[10px] uppercase tracking-widest text-ink-soft md:grid">
                    <div>Habit</div>
                    {days.map((d) => (
                      <div key={d.toISOString()} className="text-center">
                        {format(d, "EEEEE")}
                      </div>
                    ))}
                    {/* Same width as the delete button in each card's last column. */}
                    <div className="w-6" />
                  </div>

                  {/* Narrow screens: the dots wrap below each habit name, so the day
                  letters go here instead. The transparent border and matching
                  padding make this line up with the cards below to the pixel —
                  without labels the seven circles are unreadable. */}
                  <div className="mb-1 grid grid-cols-7 gap-2 rounded-2xl border border-transparent px-3 text-center text-[10px] uppercase tracking-widest text-ink-soft md:hidden">
                    {days.map((d) => (
                      <div key={d.toISOString()}>{format(d, "EEEEE")}</div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {state.habits.map((h) => (
                      <div
                        key={h.id}
                        className="group grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 rounded-2xl border border-border bg-background px-3 py-2 md:grid-cols-[1fr_repeat(7,minmax(0,44px))_auto] md:gap-2"
                      >
                        <div className="min-w-0">
                          <InlineText
                            value={h.name}
                            onSave={(v) => v && actions.updateHabit(h.id, { name: v })}
                            showIcon
                            className="text-sm font-medium"
                          />
                          <HabitGoalPicker habit={h} goals={personalGoals} />
                        </div>
                        <div className="col-span-full md:col-span-7 grid grid-cols-7 gap-2 md:contents">
                          {days.map((d) => {
                            // Local, not toISOString(): that converts to UTC
                            // first, so west of Greenwich an evening tap was
                            // logged against tomorrow.
                            const iso = dateKey(d);
                            const done = !!h.log[iso];
                            return (
                              <button
                                key={iso}
                                onClick={() => actions.toggleHabit(h.id, iso)}
                                title={format(d, "EEE, MMM d")}
                                className={`mx-auto grid place-items-center h-8 w-8 rounded-lg border transition-all ${
                                  done
                                    ? "border-primary"
                                    : "border-border bg-card hover:bg-secondary"
                                }`}
                                style={
                                  done
                                    ? {
                                        background:
                                          "linear-gradient(135deg, var(--sage-deep), var(--sage))",
                                      }
                                    : undefined
                                }
                              >
                                {done && (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4 text-primary-foreground"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="5 12 10 17 19 8" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <ConfirmDeleteButton
                          itemLabel={h.name}
                          consequence="Its logged days go with it — though Undo can bring both back right after."
                          onConfirm={() => {
                            // Capture the logged days before they go, so Undo can
                            // put the history back and not just the name.
                            const dates = Object.keys(h.log).filter((d) => h.log[d]);
                            const name = h.name;
                            actions.deleteHabit(h.id);
                            toast(`"${name}" removed`, {
                              description:
                                dates.length > 0
                                  ? `${dates.length} logged ${dates.length === 1 ? "day" : "days"} went with it.`
                                  : undefined,
                              action: {
                                label: "Undo",
                                onClick: () => actions.restoreHabit(name, dates),
                              },
                            });
                          }}
                          className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
                          aria-label={`Remove habit "${h.name}"`}
                        />
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newHabit.trim()) return;
                      actions.addHabit(newHabit.trim());
                      setNewHabit("");
                    }}
                    className="mt-4 flex gap-2"
                  >
                    <Input
                      value={newHabit}
                      onChange={(e) => setNewHabit(e.target.value)}
                      placeholder="Add a new habit — e.g. drink water"
                    />
                    <Button type="submit" variant="outline" className="rounded-full border-tan">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </form>
                </>
              )}
            </div>
          </section>

          {/*
          Anything not tied to a goal or a habit.

          Open work only. What has been finished used to trail underneath it here,
          and now has its own hideable section below — the two answer different
          questions and only one of them should be able to fill the page.
        */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-serif text-lg">Anything else</h2>
              <AddTaskDialog
                area="personal"
                trigger={
                  <Button variant="outline" size="sm" className="rounded-full border-tan">
                    <Plus className="h-3.5 w-3.5" /> Task
                  </Button>
                }
              />
            </div>
            <div className="space-y-2">
              {looseTasks.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
                  Nothing loose — everything has a home.
                </p>
              )}
              {looseTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  showArea={false}
                  floating
                  onDelete={() => actions.deleteTask(t.id)}
                />
              ))}
            </div>
          </section>

          <AreaEvents area="personal" />
        </div>

        {/* The right track. */}
        <div className="space-y-8">
          {/* Goals */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif text-lg">Goals</h2>
              <AddGoalDialog
                area="personal"
                trigger={
                  <Button variant="outline" size="sm" className="rounded-full border-tan">
                    <Plus className="h-3.5 w-3.5" /> Goal
                  </Button>
                }
              />
            </div>
            <div
              className="space-y-3"
              onPointerUp={goalDrag.endDrag}
              onPointerLeave={goalDrag.endDrag}
            >
              {personalGoals.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
                  No goals yet. On this page a goal is the whole of a project — a few steps that
                  belong together.
                </p>
              )}
              {personalGoals.map((g) => (
                <ReorderableCard
                  key={g.id}
                  id={g.id}
                  collection="goals"
                  orderedIds={personalGoals.map((x) => x.id)}
                  drag={goalDrag.drag}
                  setDrag={goalDrag.setDrag}
                >
                  <GoalCard
                    goal={g}
                    tint="sage"
                    footer={<GoalHabits goal={g} habits={state.habits} days={days} />}
                  />
                </ReorderableCard>
              ))}
            </div>
          </section>
        </div>
      </div>

      <HowFarYouveCome
        storageKey="grounded.personal.history"
        groups={[{ id: "all", tasks: doneTasks }]}
        blurb="Small, repeatable things add up quietly. Here they are."
      />
    </div>
  );
}

/**
 * Which goal a habit is working towards.
 *
 * The brief's line for this page is that goals align with daily habits, and
 * until now that was a claim the data could not back: the app held both and
 * connected neither, so walking outside every day for a month moved no goal
 * anywhere. This is the connection, and it is deliberately the smallest one
 * that could work — a habit points at one goal, or at nothing.
 *
 * A bare select rather than a dialog. Attaching a habit to a goal is a
 * half-second decision you make in passing, and anything with a confirm step
 * would cost more than the link is worth. Reads as quiet text until you use it.
 */
function HabitGoalPicker({ habit, goals }: { habit: Habit; goals: Goal[] }) {
  if (goals.length === 0) return null;
  const linked = goals.find((g) => g.id === habit.goalId);

  return (
    <label className="group/goal relative inline-flex max-w-full items-center">
      <span
        className={`truncate text-[11px] underline decoration-dotted underline-offset-4 ${
          linked ? "text-ink-soft" : "text-ink-soft opacity-0 group-hover:opacity-100"
        }`}
      >
        {linked ? `towards ${linked.name}` : "link to a goal"}
      </span>
      <select
        value={habit.goalId ?? ""}
        onChange={(e) => actions.updateHabit(habit.id, { goalId: e.target.value || undefined })}
        aria-label={`Goal for ${habit.name}`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="">On its own</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The habits feeding one goal, and how this week has gone for them.
 *
 * Seven dots per habit, no count and no percentage. The question this answers
 * is "is the practice behind this actually happening", which a row of dots
 * answers instantly and a number turns into a mark out of seven.
 */
function GoalHabits({ goal, habits, days }: { goal: Goal; habits: Habit[]; days: Date[] }) {
  const mine = habits.filter((h) => h.goalId === goal.id);
  if (mine.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">Daily habits</p>
      {mine.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-xs">{h.name}</span>
          <span className="flex shrink-0 gap-1">
            {days.map((d) => {
              const iso = dateKey(d);
              return (
                <span
                  key={iso}
                  title={format(d, "EEE, MMM d")}
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: h.log[iso] ? "var(--sage)" : "var(--surface-2)",
                  }}
                />
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

// PersonalProject used to render here: a leftover from before Personal
// dropped projects for goals (see the note above pickOneThing-era history in
// git log). Nothing in this file calls it any more — Personal has no projects
// concept left to render — so it is dead code, removed rather than wired up.
