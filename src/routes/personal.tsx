import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { actions, useAppState } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { SoftProgress } from "@/components/soft-progress";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { AddProjectDialog } from "@/components/add-project-dialog";
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
  // Tasks filed under a project are shown inside it, so they are not repeated
  // in the loose list below.
  const looseTasks = personalTasks.filter((t) => !t.projectId);

  const today = new Date();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i)), []);

  const [newHabit, setNewHabit] = useState("");
  // The habit grid keys off today's date, so it stays a skeleton until mount.
  const mounted = useMounted();

  const chartData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = addDays(today, -20 + i);
      const iso = d.toISOString().slice(0, 10);
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
        <h1 className="mt-3 font-serif text-4xl">Tend to yourself</h1>
        <p className="mt-2 text-ink-soft max-w-lg">
          Small, repeatable acts of care. No streaks to break — just gentle dots.
        </p>
      </header>

      {/* Habits */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">Daily habits</h2>
        </div>
        <div className="card-soft p-4 md:p-6">
          {!mounted ? (
            <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />
          ) : (
            <>
              {/* Wide screens: one header row across the whole table. */}
              <div className="mb-2 hidden grid-cols-[1fr_repeat(7,minmax(0,44px))_auto] gap-2 text-[10px] uppercase tracking-widest text-ink-soft md:grid">
                <div>Habit</div>
                {days.map((d) => (
                  <div key={d.toISOString()} className="text-center">
                    {format(d, "EEEEE")}
                  </div>
                ))}
                <div />
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
                        const iso = d.toISOString().slice(0, 10);
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
          <h2 className="font-serif text-2xl">Goals</h2>
          <AddGoalDialog
            area="personal"
            trigger={
              <Button variant="outline" size="sm" className="rounded-full border-tan">
                <Plus className="h-3.5 w-3.5" /> Goal
              </Button>
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {personalGoals.map((g) => (
            <GoalCard key={g.id} goal={g} tint="sage" />
          ))}
        </div>
      </section>

      {/* Projects */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl">Projects</h2>
          <AddProjectDialog
            area="personal"
            trigger={
              <Button variant="outline" size="sm" className="rounded-full border-tan">
                <Plus className="h-3.5 w-3.5" /> Project
              </Button>
            }
          />
        </div>
        <div className="space-y-3">
          {personalProjects.length === 0 && (
            <div className="card-soft p-6 text-center italic text-ink-soft">
              No projects yet — a project is just a few tasks that belong together.
            </div>
          )}
          {personalProjects.map((project) => (
            <PersonalProject key={project.id} projectId={project.id} name={project.name} />
          ))}
        </div>
      </section>

      {/* Loose tasks — anything not filed under a project. */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl">Other tasks</h2>
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
            <div className="card-soft p-6 text-center text-ink-soft italic">
              Nothing loose — everything has a home.
            </div>
          )}
          {looseTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showArea={false}
              onDelete={() => actions.deleteTask(t.id)}
            />
          ))}
        </div>
      </section>

      {/* Progress chart */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">Consistency, over time</h2>
        </div>
        <div className="card-soft p-4 md:p-6 h-64">
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
    </div>
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
