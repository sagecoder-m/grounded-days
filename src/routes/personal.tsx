import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { actions, useAppState } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineText } from "@/components/inline-text";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/personal")({
  component: PersonalPage,
});

function PersonalPage() {
  const state = useAppState();
  const personalGoals = state.goals.filter((g) => g.area === "personal");
  const personalTasks = state.tasks.filter((t) => t.area === "personal").sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const today = new Date();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i)), []);

  const [newHabit, setNewHabit] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const chartData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = addDays(today, -20 + i);
      const iso = d.toISOString().slice(0, 10);
      const completed = state.habits.reduce((s, h) => s + (h.log[iso] ? 1 : 0), 0);
      const goalAvg = personalGoals.length ? personalGoals.reduce((s, g) => s + g.progress, 0) / personalGoals.length : 0;
      return { day: format(d, "M/d"), habits: completed, goals: Math.round(goalAvg) };
    });
  }, [state.habits, personalGoals]);

  return (
    <div className="space-y-10">
      <header>
        <p className="chip bg-sage-soft text-[color:var(--sage-deep)]" style={{ backgroundColor: "var(--sage-soft)", color: "var(--sage-deep)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--sage)" }} /> Personal
        </p>
        <h1 className="mt-3 font-serif text-4xl">Tend to yourself</h1>
        <p className="mt-2 text-ink-soft max-w-lg">Small, repeatable acts of care. No streaks to break — just gentle dots.</p>
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
          <div className="hidden md:grid grid-cols-[1fr_repeat(7,minmax(0,44px))_auto] gap-2 mb-2 text-[10px] uppercase text-ink-soft tracking-widest">
            <div>Habit</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="text-center">{format(d, "EEEEE")}</div>
            ))}
            <div />
          </div>
          <div className="space-y-2">
            {state.habits.map((h) => (
              <div key={h.id} className="group grid grid-cols-[1fr_auto] md:grid-cols-[1fr_repeat(7,minmax(0,44px))_auto] items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
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
                        style={done ? { background: "linear-gradient(135deg, var(--sage-deep), var(--sage))" } : undefined}
                      >
                        {done && (
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="5 12 10 17 19 8" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => actions.deleteHabit(h.id)} className="opacity-0 group-hover:opacity-100 text-ink-soft hover:text-[color:var(--clay)] p-1" aria-label="Remove">
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
            <Input value={newHabit} onChange={(e) => setNewHabit(e.target.value)} placeholder="Add a new habit — e.g. drink water" />
            <Button type="submit" variant="outline" className="rounded-full border-tan"><Plus className="h-4 w-4" /> Add</Button>
          </form>
          </>
          )}
        </div>
      </section>

      {/* Goals */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">Goals</h2>
          <AddGoalDialog area="personal" trigger={<Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3.5 w-3.5" /> Goal</Button>} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {personalGoals.map((g) => (
            <GoalCard key={g.id} goal={g} tint="sage" />
          ))}
        </div>
      </section>

      {/* Tasks */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">Tasks</h2>
          <AddTaskDialog area="personal" trigger={<Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3.5 w-3.5" /> Task</Button>} />
        </div>
        <div className="space-y-2">
          {personalTasks.length === 0 && <div className="card-soft p-6 text-center text-ink-soft italic">No tasks yet — add something kind.</div>}
          {personalTasks.map((t) => <TaskRow key={t.id} task={t} showArea={false} onDelete={() => actions.deleteTask(t.id)} />)}
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
              <XAxis dataKey="day" fontSize={10} stroke="var(--ink-soft)" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke="var(--ink-soft)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="habits" stroke="var(--sage)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--sage)" }} />
              <Line type="monotone" dataKey="goals" stroke="var(--clay)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--clay)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--sage)" }} /> Habits completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--clay)" }} /> Avg goal progress</span>
        </div>
      </section>
    </div>
  );
}
