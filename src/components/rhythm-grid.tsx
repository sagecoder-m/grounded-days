import { useMemo } from "react";
import { format, parseISO } from "date-fns";

import { busiestDay, dailyPresence, type PresenceDay } from "@/lib/user-insights";
import type { AppState } from "@/lib/store-types";

/**
 * Twelve weeks of showing up, as presence rather than performance.
 *
 * The obvious shape for this is the contribution graph, and the obvious version
 * of that is a streak counter with a number attached — which is exactly what
 * this app does not do. What changes here is not the grid, it is what the grid
 * is allowed to say:
 *
 * - One colour, one direction. Sage from faint to full. There is no red, no
 *   amber, no second hue that could read as a warning, so a gap cannot look like
 *   an alarm.
 * - An empty day is the page's own background with a hairline edge — present,
 *   unremarkable, not a hole. A day nobody filled looks like a day nobody
 *   filled, not a day somebody failed.
 * - No count anywhere. No streak, no longest run, no total. The moment a number
 *   appears it becomes a score, and a score invites a verdict.
 * - Future days are simply absent rather than drawn as empty, because a day that
 *   has not happened is not a day you missed.
 *
 * Weeks are columns and weekdays are rows, so a glance down a column is one week
 * and a glance across a row answers "what are my Mondays like" — which is the
 * kind of thing worth noticing about yourself.
 */

const WEEKS = 12;
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Five steps is enough to read as a gradient and few enough that one extra
 *  thing on a day does not visibly change the shade — the eye should see a
 *  rhythm, not a measurement. */
function shade(count: number, busiest: number): string {
  if (count === 0) return "transparent";
  const step = Math.ceil((count / busiest) * 4);
  const weight = [22, 40, 58, 76, 94][Math.min(step, 4)];
  return `color-mix(in oklab, var(--sage) ${weight}%, var(--card))`;
}

function Cell({ day, busiest }: { day: PresenceDay; busiest: number }) {
  if (!day.inRange) {
    // Not yet. Nothing drawn at all, so it cannot be mistaken for an empty day.
    return <div className="aspect-square rounded-[3px]" aria-hidden />;
  }
  const filled = day.count > 0;
  return (
    <div
      className={`aspect-square rounded-[3px] ${filled ? "" : "border border-border/70"}`}
      style={filled ? { backgroundColor: shade(day.count, busiest) } : undefined}
      title={`${format(parseISO(day.date), "EEEE d MMMM")}${
        filled ? ` — ${day.count === 1 ? "one thing" : `${day.count} things`}` : ""
      }`}
    />
  );
}

export function RhythmGrid({ state }: { state: AppState }) {
  const days = useMemo(() => dailyPresence(state, WEEKS), [state]);
  const busiest = useMemo(() => busiestDay(days), [days]);
  const anything = days.some((d) => d.count > 0);

  // Column-major: each inner array is one week, top to bottom Monday to Sunday.
  const weeks = useMemo(() => {
    const out: PresenceDay[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Your rhythm</h2>
        <span className="text-xs italic text-ink-soft">The last twelve weeks</span>
      </div>

      <div className="card-soft p-4 md:p-5">
        {anything ? (
          <>
            {/* The weekday rail is hidden until there is room for it: at half
                width the squares matter more than the labels. */}
            {/* Capped so the squares stay squares. Unbounded, twelve columns
                across a full-width widget grow to ~50px each and the thing reads
                as a calendar you are meant to click rather than a pattern you
                are meant to glance at. It still fills the width when narrow. */}
            <div className="flex max-w-[26rem] gap-1.5">
              <div className="hidden shrink-0 flex-col justify-between py-[1px] @sm:flex">
                {WEEKDAY_LABELS.map((d, i) => (
                  <span key={i} className="text-[9px] leading-none text-ink-soft/70">
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]">
                {weeks.map((week) =>
                  week.map((day) => <Cell key={day.date} day={day} busiest={busiest} />),
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-soft">
              <span>quieter</span>
              <span className="flex gap-[3px]">
                {[0, 1, 2, 3, 4].map((s) => (
                  <span
                    key={s}
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--sage) ${[22, 40, 58, 76, 94][s]}%, var(--card))`,
                    }}
                  />
                ))}
              </span>
              <span>fuller</span>
              {/* Says the thing outright, because a grid of squares has a strong
                  cultural association with streaks and this one is not that. */}
              <span className="ml-auto hidden @lg:inline">
                Gaps are part of it &mdash; nothing is being counted against you.
              </span>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-ink-soft">
            Nothing to show yet. Tick a habit, write a line, finish something &mdash; the shape
            builds itself from there.
          </p>
        )}
      </div>
    </section>
  );
}
