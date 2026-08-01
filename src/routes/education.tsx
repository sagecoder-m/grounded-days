import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { actions, useAppState } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Pause, RotateCcw, Plus } from "lucide-react";

export const Route = createFileRoute("/education")({
  component: EducationPage,
});

const GEORGETOWN_DATE = "2026-08-03";

function EducationPage() {
  const state = useAppState();
  const goals = state.goals.filter((g) => g.area === "education");
  const tasks = state.tasks.filter((t) => t.area === "education");
  const active = tasks.filter((t) => !t.done).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const history = tasks.filter((t) => t.done).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const daysToStart = differenceInDays(parseISO(GEORGETOWN_DATE), new Date());

  return (
    <div className="space-y-10">
      <header>
        <p className="chip" style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--clay)" }} /> Education
        </p>
        <h1 className="mt-3 font-serif text-4xl">Learn at your own pace</h1>
        {daysToStart >= 0 && (
          <div className="mt-4 card-soft p-4 md:p-5 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--clay-soft)" }}>
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-soft">MSBA · Georgetown</div>
              <div className="font-serif text-2xl mt-1">Begins {format(parseISO(GEORGETOWN_DATE), "MMMM d, yyyy")}</div>
            </div>
            <div className="text-right">
              <div className="font-serif text-4xl tabular-nums" style={{ color: "var(--clay)" }}>{daysToStart}</div>
              <div className="text-xs text-ink-soft">days to go — no rush</div>
            </div>
          </div>
        )}
      </header>

      <FocusTimer />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">Goals</h2>
          <AddGoalDialog area="education" trigger={<Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3.5 w-3.5" /> Goal</Button>} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => <GoalCard key={g.id} goal={g} tint="clay" />)}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">To do</h2>
          <AddTaskDialog area="education" trigger={<Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3.5 w-3.5" /> Task</Button>} />
        </div>
        <div className="space-y-2">
          {active.length === 0 && <div className="card-soft p-6 text-center text-ink-soft italic">All caught up. Nice.</div>}
          {active.map((t) => <TaskRow key={t.id} task={t} showArea={false} onDelete={() => actions.deleteTask(t.id)} />)}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-2xl">History</h2>
          <span className="text-xs text-ink-soft">{history.length} completed · {state.focusSessions.length} focus sessions</span>
        </div>
        <div className="space-y-2">
          {history.length === 0 && state.focusSessions.length === 0 && (
            <div className="card-soft p-6 text-center text-ink-soft italic">Your completed work will collect here.</div>
          )}
          {history.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center justify-between opacity-80">
              <div>
                <div className="text-sm line-through decoration-1">{t.title}</div>
                {t.description && <div className="text-xs text-ink-soft">{t.description}</div>}
              </div>
              <div className="text-[11px] text-ink-soft">{t.date && format(parseISO(t.date), "MMM d")}</div>
            </div>
          ))}
          {state.focusSessions.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="chip" style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}>Focus</div>
                <div className="text-sm">{s.label}</div>
              </div>
              <div className="text-[11px] text-ink-soft">{s.minutes} min · {format(new Date(s.completedAt), "MMM d")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FocusTimer() {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [label, setLabel] = useState("Study session");
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loggedRef = useRef<string | null>(null);

  /**
   * Writes one focus session, guarded against a repeat for the same completion.
   * The guard key includes the minute so back-to-back identical sessions still
   * each get logged.
   */
  const logSession = (sessionLabel: string, minutes: number) => {
    const key = `${sessionLabel}|${minutes}|${Math.floor(Date.now() / 1000)}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;
    actions.logFocus(sessionLabel, minutes);
  };

  useEffect(() => {
    if (!running) return;
    intRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intRef.current!);
          setRunning(false);
          if (phase === "focus") {
            // Logged outside this updater: React may invoke a state updater
            // twice (StrictMode), which would double-write the session.
            queueMicrotask(() => logSession(label || "Focus session", focusMin));
            try {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = "sine"; o.frequency.value = 528; o.connect(g); g.connect(ctx.destination);
              g.gain.setValueAtTime(0.001, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
              o.start(); o.stop(ctx.currentTime + 1.5);
            } catch {}
            toast("Nicely done. Take a soft pause.", { description: `${focusMin} minutes of focus, logged.` });
            setPhase("break");
            setSecondsLeft(breakMin * 60);
          } else {
            toast("Break's up whenever you're ready.");
            setPhase("focus");
            setSecondsLeft(focusMin * 60);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intRef.current!);
  }, [running, phase, focusMin, breakMin, label]);

  useEffect(() => {
    if (!running) setSecondsLeft((phase === "focus" ? focusMin : breakMin) * 60);
  }, [focusMin, breakMin, phase, running]);

  const total = (phase === "focus" ? focusMin : breakMin) * 60;
  const pct = 1 - secondsLeft / total;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const size = 240;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-2xl">Focus timer</h2>
        <span className="text-xs text-ink-soft italic">One block at a time.</span>
      </div>
      <div className="card-soft p-6 md:p-8 grid md:grid-cols-[auto_1fr] gap-8 items-center">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={phase === "focus" ? "var(--clay)" : "var(--sage)"}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[10px] uppercase tracking-widest text-ink-soft">{phase === "focus" ? "Focus" : "Break"}</div>
            <div className="font-serif text-5xl tabular-nums mt-1">{mm}:{ss}</div>
            <div className="text-xs text-ink-soft mt-1 max-w-40 text-center truncate">{label}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-ink-soft">What are you working on?</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Session label" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-ink-soft">Focus (min)</label>
              <Input type="number" min={5} max={90} value={focusMin} onChange={(e) => setFocusMin(Math.max(1, Number(e.target.value) || 25))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-ink-soft">Break (min)</label>
              <Input type="number" min={1} max={30} value={breakMin} onChange={(e) => setBreakMin(Math.max(1, Number(e.target.value) || 5))} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={() => setRunning((r) => !r)}>
              {running ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Start</>}
            </Button>
            <Button variant="outline" className="rounded-full border-tan" onClick={() => { setRunning(false); setPhase("focus"); setSecondsLeft(focusMin * 60); }}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
