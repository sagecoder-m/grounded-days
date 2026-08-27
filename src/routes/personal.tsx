import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { actions, useAppState } from "@/lib/store";
import { dateKey } from "@/components/task-grid";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { ReorderableCard, useCardDrag } from "@/components/reorderable-card";
import { SoftProgress } from "@/components/soft-progress";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import { toast } from "sonner";
import { InlineText } from "@/components/inline-text";
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
  const personalProjects = state.projects.filter((p) => p.area === "personal");
  /*
    Personal has no projects any more, so nothing is filed away out of sight and
    every open task belongs in this one list — the projectId filter that used to
    hide them went with the section that displayed them.

    Finished work is split out rather than dropped: it is what "see how far
    you've come" is made of. Newest first, because the thing you did this
    morning is the one worth seeing.
  */
  const looseTasks = personalTasks.filter((t) => !t.done);
  const doneTasks = personalTasks
    .filter((t) => t.done)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

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

  const chartData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = addDays(today, -20 + i);
      const iso = dateKey(d);
      const completed = state.habits.reduce((s, h) => s + (h.log[iso] ? 1 : 0), 0);
      const goalAvg = personalGoals.length
        ? personalGoals.reduce((s, g) => s + g.progress, 0) / personalGoals.length
        : 0;
      return { day: format(d, "M/d"), habits: completed, goals: Math.round(goalAvg) };
    });
  }, [state.habits, personalGoals]);

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
              <YAxis fontSize={10} stroke="var(--ink-soft)" tickLine={false} axisLine={false} />
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
              <Line
                type="monotone"
                dataKey="goals"
                stroke="var(--clay)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--clay)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--sage)" }} />{" "}
            Habits completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--clay)" }} /> Avg
            goal progress
          </span>
        </div>
      </section>

      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
                      <InlineText
                        value={h.name}
                        onSave={(v) => v && actions.updateHabit(h.id, { name: v })}
                        showIcon
                        className="text-sm font-medium"
                      />
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
                                done ? "border-primary" : "border-border bg-card hover:bg-secondary"
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
                      <button
                        onClick={() => {
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
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                <GoalCard goal={g} tint="sage" />
              </ReorderableCard>
            ))}
          </div>
        </section>
      </div>

      {/*
        Other tasks, and the only backward-looking part of the page.

        The brief's line is "'other tasks' → see how far you've come", and the
        arrow is the instruction: this is not merely the leftovers, it is where
        you find out the leftovers have been getting done. So what is
        outstanding sits at the top and what is finished collects underneath,
        rather than vanishing the moment it is ticked.
      */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg">Other tasks</h2>
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
          {looseTasks.length === 0 && doneTasks.length === 0 && (
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

          {doneTasks.length > 0 && (
            <>
              <p className="px-1 pt-4 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                How far you&rsquo;ve come
              </p>
              {doneTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  showArea={false}
                  floating
                  onDelete={() => actions.deleteTask(t.id)}
                />
              ))}
            </>
          )}
        </div>
      </section>

      <OlderProjects projects={personalProjects} />
    </div>
  );
}

/**
 * Projects an account made back when this page had them.
 *
 * The brief removes projects here — "goals = projects" — and a container that
 * simply stops being rendered is a container whose contents look deleted. Their
 * tasks were never lost (loose personal tasks show above regardless), but the
 * grouping was, so anyone who had one deserves to see where it went. Shown only
 * to accounts that actually have any, so it disappears for good on its own.
 */
function OlderProjects({ projects }: { projects: { id: string; name: string }[] }) {
  if (projects.length === 0) return null;

  return (
    <section>
      <h2 className="font-serif text-lg">Older projects</h2>
      <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">
        Personal works in goals now — a goal here is what a project was. These are still yours;
        their tasks are in the list above. Delete one when you have moved what you want out of it.
      </p>
      <div className="mt-3 space-y-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-tan px-4 py-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <button
              onClick={() => actions.deleteProject(p.id)}
              className="shrink-0 text-ink-soft transition-colors hover:text-[color:var(--clay)]"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A personal project: a name, the tasks under it, and a bar that fills as they
 * are ticked. Deliberately flatter than the Professional version — no
 * sub-projects, because "move apartment" does not need a work breakdown.
 */
function PersonalProject({ projectId, name }: { projectId: string; name: string }) {
  const state = useAppState();
  const tasks = state.tasks.filter((t) => t.projectId === projectId);
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="group card-soft space-y-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineText
            value={name}
            onSave={(v) => v && actions.updateProject(projectId, { name: v })}
            showIcon
            className="font-serif text-lg"
          />
          <div className="mt-2 flex items-center gap-3">
            <SoftProgress value={pct} tint="sage" className="max-w-xs flex-1" />
            <span className="text-xs tabular-nums text-ink-soft">
              {tasks.length ? `${done}/${tasks.length}` : "no tasks yet"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddTaskDialog
            area="personal"
            projectId={projectId}
            trigger={
              <Button variant="outline" size="sm" className="rounded-full border-tan">
                <Plus className="h-3 w-3" /> Task
              </Button>
            }
          />
          <button
            onClick={() => actions.deleteProject(projectId)}
            className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
            aria-label={`Delete project "${name}"`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showArea={false}
              onDelete={() => actions.deleteTask(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
