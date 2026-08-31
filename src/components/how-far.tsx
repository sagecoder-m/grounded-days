import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";

import type { FocusSession, Task } from "@/lib/store-types";

/**
 * The look back, and the only part of an area page that faces that way.
 *
 * Everything else in this app is about what is left. This is the one place that
 * says what is behind you, and it exists because finished work otherwise
 * vanishes the instant it is ticked — which means a hard fortnight leaves no
 * evidence of itself at all, and the only thing on screen is the part you have
 * not done yet.
 *
 * Hidden by default, and remembered per device. That default is the whole
 * design: a list of everything you have completed is lovely to go and look at
 * and heavy to be shown unprompted every time you open the page to work. Being
 * shown your own history without asking is how a record of effort turns into a
 * standard to measure today against.
 *
 * No counts, no totals, no "12 completed this week". The section answers "has
 * anything been happening" — which a list answers by existing — and refuses to
 * answer "how much", because that question has a right answer and therefore a
 * wrong one.
 */

export interface HowFarGroup {
  id: string;
  /** Shown above the group. Omit when there is only one and it needs no name. */
  label?: string;
  tasks: Task[];
}

export function HowFarYouveCome({
  storageKey,
  groups,
  sessions = [],
  blurb,
}: {
  /** Per-page, so hiding it on one area does not hide it everywhere. */
  storageKey: string;
  groups: HowFarGroup[];
  /** Only where the timer lives, so a session is not counted three times over. */
  sessions?: FocusSession[];
  blurb: string;
}) {
  const [shown, setShown] = useState(false);

  // After mount: this comes from the device, which the server knows nothing
  // about, and reading it during render would differ between the two.
  useEffect(() => {
    try {
      setShown(window.localStorage.getItem(storageKey) === "open");
    } catch {
      /* storage unavailable; stays closed */
    }
  }, [storageKey]);

  function toggle() {
    setShown((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        /* nothing to remember it with */
      }
      return next;
    });
  }

  const filled = groups.filter((g) => g.tasks.length > 0);
  const nothing = filled.length === 0 && sessions.length === 0;

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">See how far you&rsquo;ve come</h2>
        <button
          onClick={toggle}
          aria-expanded={shown}
          className="text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          {shown ? "Hide" : "Unhide"}
        </button>
      </div>
      <p className="text-sm italic text-ink-soft">{blurb}</p>

      {shown && (
        <div className="mt-3 space-y-4">
          {nothing && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
              Your completed work will collect here.
            </p>
          )}

          {filled.map((group) => (
            <div key={group.id} className="space-y-2">
              {/* Named only when there is something to distinguish. On
                  Professional every group is a project, which is the point —
                  finished work means more when you can see which piece of work
                  it belonged to. */}
              {group.label && (
                <p className="px-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  {group.label}
                </p>
              )}
              {group.tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 opacity-80"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm line-through decoration-1">{t.title}</div>
                    {t.description && (
                      <div className="truncate text-xs text-ink-soft">{t.description}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-[11px] text-ink-soft">
                    {t.date && format(parseISO(t.date), "MMM d")}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {sessions.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                Focus sessions
              </p>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="chip shrink-0"
                      style={{ backgroundColor: "var(--clay-soft)", color: "var(--clay)" }}
                    >
                      Focus
                    </span>
                    <span className="truncate text-sm">{s.label}</span>
                  </div>
                  <div className="shrink-0 text-[11px] text-ink-soft">
                    {s.minutes} min · {format(new Date(s.completedAt), "MMM d")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
