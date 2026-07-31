import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { format, isBefore, isToday, parseISO, addDays } from "date-fns";
import { useAppState } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { SoftProgress } from "@/components/soft-progress";
import { AreaChip } from "@/components/area-chip";
import { CalendarBoard } from "@/components/calendar-board";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Area as RArea, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/")({
  component: Overview,
});

function greeting(name: string) {
  const h = new Date().getHours();
  const g = h < 5 ? "Rest well" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Winding down";
  return `${g}, ${name}`;
}

function Overview() {
  const state = useAppState();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const areaProgress = useMemo(() => {
    const areas = ["personal", "professional", "education"] as const;
    return areas.map((a) => {
      const gs = state.goals.filter((g) => g.area === a);
      const avg = gs.length ? Math.round(gs.reduce((s, g) => s + g.progress, 0) / gs.length) : 0;
      return { area: a, value: avg };
    });
  }, [state.goals]);

  const todaysTasks = state.tasks
    .filter((t) => t.date === todayStr || (!t.done && t.date && isBefore(parseISO(t.date), today)))
    .sort((a, b) => Number(a.done) - Number(b.done));

  const upcoming = useMemo(() => {
    const items: { id: string; title: string; date: string; area?: string; kind: "task" | "event"; taskId?: string }[] = [];
    state.tasks.forEach((t) => {
      if (!t.date || t.done) return;
      const d = parseISO(t.date);
      if (d >= today || isToday(d)) items.push({ id: `t-${t.id}`, taskId: t.id, title: t.title, date: t.date, area: t.area, kind: "task" });
    });
    state.events.forEach((e) => {
      const d = parseISO(e.date);
      if (d >= today || isToday(d)) items.push({ id: `e-${e.id}`, title: e.title, date: e.date, area: e.area, kind: "event" });
    });
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [state.tasks, state.events]);

  // Weekly area chart: aggregate completed tasks per day per area over last 14d
  const chartData = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, -13 + i);
      return d.toISOString().slice(0, 10);
    });
    return days.map((d) => {
      const dObj = parseISO(d);
      const personal = state.tasks.filter((t) => t.area === "personal" && t.done && t.date === d).length +
        state.habits.reduce((s, h) => s + (h.log[d] ? 1 : 0), 0);
      const professional = state.tasks.filter((t) => t.area === "professional" && t.done && t.date === d).length;
      const education = state.tasks.filter((t) => t.area === "education" && t.done && t.date === d).length;
      return { day: format(dObj, "MMM d"), personal, professional, education };
    });
  }, [state.tasks, state.habits]);

  const settings = state.settings;
  const w = (k: string) => settings.widgets.find((x) => x.key === k)?.enabled ?? true;
  const orderedWidgets = settings.widgets.filter((x) => x.enabled).map((x) => x.key);

  return (
    <div className="space-y-8">
      {orderedWidgets.map((key) => {
        if (key === "greeting")
          return (
            <section key={key}>
              <p className="text-sm text-ink-soft">{format(today, "EEEE, MMMM d, yyyy")}</p>
              <h1 className="mt-1 font-serif text-4xl md:text-5xl">{greeting(settings.displayName || "friend")}</h1>
              <p className="mt-2 text-ink-soft max-w-lg">Take a breath. Here's your gentle rundown for today — one small thing at a time.</p>
            </section>
          );

        if (key === "tasks" && w("tasks"))
          return (
            <section key={key}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif text-2xl">Today</h2>
                <span className="text-xs text-ink-soft">{todaysTasks.filter((t) => !t.done).length} to gently tackle</span>
              </div>
              <div className="space-y-2">
                {todaysTasks.length === 0 && (
                  <div className="card-soft p-6 text-center text-ink-soft italic">Nothing pressing. Enjoy some space.</div>
                )}
                {todaysTasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </section>
          );

        if (key === "goals" && w("goals"))
          return (
            <section key={key}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif text-2xl">How your areas are moving</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {areaProgress.map((a) => (
                  <div key={a.area} className="card-soft density-p p-5">
                    <div className="flex items-center justify-between mb-3">
                      <AreaChip area={a.area} />
                      <span className="tabular-nums text-2xl font-serif">{a.value}%</span>
                    </div>
                    <SoftProgress
                      value={a.value}
                      tint={a.area === "personal" ? "sage" : a.area === "professional" ? "brown" : "clay"}
                    />
                  </div>
                ))}
              </div>
            </section>
          );

        if (key === "chart" && w("chart"))
          return (
            <section key={key}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif text-2xl">Two-week rhythm</h2>
                <span className="text-xs text-ink-soft">Completed items per area</span>
              </div>
              <div className="card-soft p-4 md:p-6">
                <div className="grid md:grid-cols-[2fr_1fr] gap-6">
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
                        <XAxis dataKey="day" fontSize={10} stroke="var(--ink-soft)" tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} stroke="var(--ink-soft)" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                        />
                        <RArea type="monotone" dataKey="personal" stroke="var(--sage)" fill="url(#gs)" strokeWidth={2} />
                        <RArea type="monotone" dataKey="professional" stroke="var(--brown)" fill="url(#gb)" strokeWidth={2} />
                        <RArea type="monotone" dataKey="education" stroke="var(--clay)" fill="url(#gc)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={areaProgress.map((a) => ({ name: a.area, value: Math.max(a.value, 5) }))}
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
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          );

        if (key === "calendar" && w("calendar")) return <CalendarBoard key={key} />;

        if (key === "upcoming" && w("upcoming"))
          return (
            <section key={key}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-serif text-2xl">Upcoming</h2>
                <span className="text-xs text-ink-soft italic">Check off only — no edits here</span>
              </div>
              <div className="space-y-2">
                {upcoming.length === 0 && (
                  <div className="card-soft p-6 text-center text-ink-soft italic">Nothing on the horizon.</div>
                )}
                {upcoming.map((u) =>
                  u.kind === "task" ? (
                    <TaskRow key={u.id} task={state.tasks.find((t) => t.id === u.taskId)!} readOnly />
                  ) : (
                    <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: u.area ? (u.area === "personal" ? "var(--sage)" : u.area === "professional" ? "var(--brown)" : "var(--clay)") : "var(--tan)" }} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{u.title}</div>
                        <div className="text-[11px] text-ink-soft">{format(parseISO(u.date), "EEE, MMM d")} · event</div>
                      </div>
                      {u.area && <AreaChip area={u.area as any} />}
                    </div>
                  ),
                )}
              </div>
            </section>
          );

        return null;
      })}
    </div>
  );
}
