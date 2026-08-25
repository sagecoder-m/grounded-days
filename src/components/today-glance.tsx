import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { useAppState } from "@/lib/store";
import { TaskGrid } from "@/components/task-grid";
import { conflictingEventIds } from "@/lib/schedule";
import { useMounted } from "@/lib/use-mounted";
import type { Area } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/**
 * The shape of today, and only today.
 *
 * A month grid answers "what is coming?", which is a different and heavier
 * question — thirty-five cells of things not yet due is precisely the kind of
 * pile this app exists to avoid. This answers "what does today look like?"
 *
 * Tasks appear as bare one-liners rather than repeating the tiles above: seeing
 * the same task twice in one screen reads as twice the work.
 */
export function TodayGlance() {
  const state = useAppState();
  const mounted = useMounted();

  // Everything here keys off today's date, so hold a placeholder until the
  // client has mounted rather than risk a server/client mismatch.
  if (!mounted) {
    return <div className="card-soft h-44 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  const today = new Date();
  const iso = format(today, "yyyy-MM-dd");

  const events = state.events.filter((e) => e.date === iso);
  const timed = events
    .filter((e) => !e.allDay && e.startsAt)
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const allDay = events.filter((e) => e.allDay || !e.startsAt);

  // Same helper the calendar board uses, so a clash reads identically in both.
  const conflicts = conflictingEventIds(events);

  const tasks = state.tasks.filter((t) => t.date === iso);
  const remaining = tasks.filter((t) => !t.done).length;

  const nothing = events.length === 0 && tasks.length === 0;

  return (
    /*
     * The card holds the day's events; the task grid sits outside it.
     *
     * Nesting the grid inside meant today's task rows started 21px further in
     * and ran 42px narrower than the identical rows under "Upcoming" directly
     * below — two lists of the same thing, stacked, not lining up. Keeping the
     * grid out of the card puts both at the same left edge and width, and also
     * stops task rows being cards drawn inside another card.
     */
    <div className="space-y-4">
      <div className="card-soft space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-serif text-lg">{format(today, "EEEE, MMMM d")}</div>
          <div className="text-xs text-ink-soft">
            {nothing
              ? "nothing scheduled"
              : [
                  events.length > 0 &&
                    `${events.length} ${events.length === 1 ? "event" : "events"}`,
                  tasks.length > 0 && `${remaining} of ${tasks.length} to do`,
                ]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
          </div>
        </div>

        {nothing && (
          <p className="py-2 text-center text-sm italic text-ink-soft">
            A clear day. That counts as a good one.
          </p>
        )}

        {timed.length > 0 && (
          <ul className="space-y-2">
            {timed.map((event) => (
              <li key={event.id} className="flex items-baseline gap-3">
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {format(new Date(event.startsAt!), "h:mm a")}
                </span>
                <span
                  className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
                  style={{ backgroundColor: event.area ? AREA_VAR[event.area] : "var(--tan)" }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {event.title}
                  {conflicts.has(event.id) && (
                    <span className="ml-1.5 text-[11px] text-[color:var(--clay)]">overlaps</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {allDay.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allDay.map((event) => (
              <span key={event.id} className="chip bg-secondary text-ink-soft">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: event.area ? AREA_VAR[event.area] : "var(--tan)" }}
                />
                {event.title}
              </span>
            ))}
          </div>
        )}

        <Link
          to="/calendar"
          className="block text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          See the whole calendar
        </Link>
      </div>

      {/*
        Today's tasks, in the same grid "Upcoming" uses below. They were bare
        one-liners while a separate "Today" section carried the real checkboxes;
        with that section gone this is the only place they are actionable, so
        they get the full row. No add button - the grid below already has one.

        Skipped on a genuinely empty day: the "a clear day" line above says it,
        and the grid's own empty state would say it again a few lines lower.
      */}
      {!nothing && <TaskGrid tasks={state.tasks} from={iso} to={iso} showAdd={false} includeOverdue />}
    </div>
  );
}
