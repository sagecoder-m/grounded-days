import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { format, isBefore, isToday, parseISO, addDays } from "date-fns";
import { useAppState } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { SoftProgress } from "@/components/soft-progress";
import { AreaChip } from "@/components/area-chip";
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

        if (key === "calendar" && w("calendar")) return <CalendarSection key={key} />;

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

// -------- Calendar --------
import { useState } from "react";
import { actions } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { startOfWeek, addWeeks, startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, addMonths, isSameMonth, startOfYear, addYears } from "date-fns";

function CalendarSection() {
  const state = useAppState();
  const [view, setView] = useState<"week" | "month" | "year">(state.settings.defaultCalView);
  const [cursor, setCursor] = useState(new Date());

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-serif text-2xl">Calendar</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-soft italic hidden md:inline">Sync with Google, Outlook, Canvas — coming soon</span>
          <div className="flex rounded-full bg-secondary p-1">
            {(["week", "month", "year"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`chip capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-ink-soft"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <AddEventDialog />
        </div>
      </div>
      <div className="card-soft p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <button className="chip bg-secondary" onClick={() => setCursor(view === "week" ? addWeeks(cursor, -1) : view === "month" ? addMonths(cursor, -1) : addYears(cursor, -1))}>‹ prev</button>
          <div className="font-serif text-lg">
            {view === "week" && `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}`}
            {view === "month" && format(cursor, "MMMM yyyy")}
            {view === "year" && format(cursor, "yyyy")}
          </div>
          <button className="chip bg-secondary" onClick={() => setCursor(view === "week" ? addWeeks(cursor, 1) : view === "month" ? addMonths(cursor, 1) : addYears(cursor, 1))}>next ›</button>
        </div>
        {view === "week" && <WeekView cursor={cursor} events={state.events} tasks={state.tasks} />}
        {view === "month" && <MonthView cursor={cursor} events={state.events} tasks={state.tasks} />}
        {view === "year" && <YearView cursor={cursor} events={state.events} tasks={state.tasks} />}
      </div>
    </section>
  );
}

function itemsFor(date: string, events: any[], tasks: any[]) {
  return [
    ...events.filter((e) => e.date === date).map((e) => ({ ...e, kind: "event" as const })),
    ...tasks.filter((t) => t.date === date).map((t) => ({ ...t, kind: "task" as const })),
  ];
}

function dotColor(area?: string) {
  return area === "personal" ? "var(--sage)" : area === "professional" ? "var(--brown)" : area === "education" ? "var(--clay)" : "var(--tan)";
}

function WeekView({ cursor, events, tasks }: any) {
  const start = startOfWeek(cursor);
  const days = eachDayOfInterval({ start, end: endOfWeek(cursor) });
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = d.toISOString().slice(0, 10);
        const items = itemsFor(iso, events, tasks);
        const isTodayC = isToday(d);
        return (
          <div key={iso} className={`min-h-24 rounded-2xl border p-2 ${isTodayC ? "bg-accent border-primary" : "bg-background border-border"}`}>
            <div className="text-[10px] uppercase tracking-wide text-ink-soft">{format(d, "EEE")}</div>
            <div className="font-serif text-lg">{format(d, "d")}</div>
            <div className="mt-1 space-y-1">
              {items.slice(0, 3).map((it: any) => (
                <div key={`${it.kind}-${it.id}`} className="flex items-center gap-1 text-[11px] truncate">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor(it.area) }} />
                  <span className="truncate">{it.title}</span>
                </div>
              ))}
              {items.length > 3 && <div className="text-[10px] text-ink-soft">+{items.length - 3} more</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ cursor, events, tasks }: any) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start, end });
  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] uppercase text-ink-soft tracking-widest">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const items = itemsFor(iso, events, tasks);
          const outside = !isSameMonth(d, cursor);
          return (
            <div key={iso} className={`min-h-16 rounded-xl border p-1.5 text-xs ${isToday(d) ? "bg-accent border-primary" : "bg-background border-border"} ${outside ? "opacity-40" : ""}`}>
              <div className="font-medium">{format(d, "d")}</div>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {items.slice(0, 4).map((it: any) => (
                  <span key={`${it.kind}-${it.id}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor(it.area) }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ cursor, events, tasks }: any) {
  const year = cursor.getFullYear();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(year, i, 1);
        const monthTasks = tasks.filter((t: any) => t.date?.startsWith(`${year}-${String(i + 1).padStart(2, "0")}`)).length;
        const monthEvents = events.filter((e: any) => e.date.startsWith(`${year}-${String(i + 1).padStart(2, "0")}`)).length;
        return (
          <div key={i} className="rounded-2xl border border-border bg-background p-3">
            <div className="font-serif text-base">{format(monthDate, "MMMM")}</div>
            <div className="text-xs text-ink-soft mt-1">{monthTasks} tasks · {monthEvents} events</div>
          </div>
        );
      })}
    </div>
  );
}

function AddEventDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [area, setArea] = useState<string>("personal");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full border-tan" size="sm"><Plus className="h-3.5 w-3.5" /> Event</Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle className="font-serif text-2xl">Add an event</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            actions.addEvent({ title: title.trim(), date, area: area as any });
            setTitle("");
            setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="education">Education</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button type="submit" className="rounded-full">Add event</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
