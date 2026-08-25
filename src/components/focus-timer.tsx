import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { actions } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The study timer, lifted out of the Education route when that page was rebuilt
 * around courses. Behaviour is unchanged — extracted so the route file is about
 * courses and assignments rather than also carrying a timer.
 */
/**
 * `medium` shrinks the dial and tightens the padding so the timer can lead a
 * page without dominating it. At 240px the dial was the largest thing on
 * Education and pulled the eye before the assignments did — which is the wrong
 * order when it sits at the top.
 */
export function FocusTimer({ size: variant = "large" }: { size?: "large" | "medium" } = {}) {
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

  const size = variant === "medium" ? 168 : 240;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-2xl">Focus timer</h2>
        <span className="text-xs text-ink-soft italic">One block at a time.</span>
      </div>
      <div
        className={`card-soft grid items-center md:grid-cols-[auto_1fr] ${
          variant === "medium" ? "gap-6 p-5 md:p-6" : "gap-8 p-6 md:p-8"
        }`}
      >
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
            <div className={`mt-1 font-serif tabular-nums ${variant === "medium" ? "text-3xl" : "text-5xl"}`}>{mm}:{ss}</div>
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
