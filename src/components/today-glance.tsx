import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { useAppState } from "@/lib/store";
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
    <div className="card-soft space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-serif text-lg">{format(today, "EEEE, MMMM d")}</div>
        <div className="text-xs text-ink-soft">
          {nothing
            ? "nothing scheduled"
            : [
                events.length > 0 && `${events.length} ${events.length === 1 ? "event" : "events"}`,
                tasks.length > 0 && `${remaining} of ${tasks.length} to do`,
              ]
                .filter(Boolean)
                .join(" · ")}
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

      {tasks.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink-soft">
            Also today
          </div>
          <ul className="space-y-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-center gap-2 text-sm ${task.done ? "text-ink-soft line-through" : ""}`}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: AREA_VAR[task.area] }}
                />
                <span className="truncate">{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        to="/calendar"
        className="block text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        See the whole calendar
      </Link>
    </div>
  );
}
