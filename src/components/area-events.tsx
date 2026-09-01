import { addDays, format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

import { useAppState } from "@/lib/store";
import { dateKey } from "@/lib/dates";
import type { Area, CalEvent } from "@/lib/store-types";

/** Same horizon Education's own "Due this week" uses, so an event and an
 *  assignment due the same day are both "this week" by the same yardstick. */
const HORIZON_DAYS = 7;

/** One event, as a line — no checkbox, on purpose: an event happens to you,
 *  a task is something you do (see today-glance.tsx's AgendaRow, which this
 *  mirrors). Exported so Education's own Today section can fold an event
 *  into the same list as its tasks without re-drawing this row from scratch. */
export function EventRow({
  event,
  today,
  course,
}: {
  event: CalEvent;
  today: string;
  /** The course this class is for, when the title named one. Read, never
   *  guessed — see courseForEvent. Absent for anything unrecognised. */
  course?: string;
}) {
  return (
    <div className="flex items-baseline gap-2.5 py-1">
      <span className="w-14 shrink-0 text-[11px] tabular-nums text-ink-soft">
        {event.date === today
          ? event.allDay || !event.startsAt
            ? "today"
            : format(new Date(event.startsAt), "h:mm a")
          : format(parseISO(event.date), "EEE d")}
      </span>
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">{event.title}</span>
      {course && (
        <span className="chip shrink-0 bg-clay-soft text-[11px] text-[color:var(--clay)]">
          {course}
        </span>
      )}
    </div>
  );
}

/**
 * The events an area page was missing.
 *
 * Education, Personal and Professional each show their own tasks and goals —
 * every one of those pages filters state.tasks / state.goals by area — but
 * none of them ever looked at state.events. Add something as a Task from the
 * Calendar with the area set to Education and it correctly shows up on the
 * Education page; add the exact same thing as an Event instead, and it had
 * nowhere on any area's own page to appear at all. Not an Education bug
 * specifically — Personal and Professional have the identical gap, since
 * none of the three pages ever read state.events.
 *
 * Synced events included, which they were not at first. The original rule was
 * "local only", on the reasoning that a Google or Outlook event carries no area
 * and so has nothing to match — true when it was written, and untrue since each
 * connection gained a default area and the sync began stamping it onto every
 * row it writes. The consequence was quietly bad on the page it mattered most:
 * a student's lectures all arrive from their university's calendar, so
 * Education showed assignments and never a single class.
 *
 * Renders nothing when there is nothing to show, same as Education's other
 * date-scoped sections — an empty "On your calendar" heading every day would
 * be worse than the section just not being there.
 */
export function AreaEvents({
  area,
  excludeToday = false,
}: {
  area: Area;
  /** Education passes this: its own Today section already folds in today's
   *  events (see the EventRow above), so repeating them here would be the
   *  same event twice under two different headings on one page. */
  excludeToday?: boolean;
}) {
  const state = useAppState();
  const today = dateKey(new Date());
  const horizon = dateKey(addDays(new Date(), HORIZON_DAYS));

  const events = state.events
    .filter((e) => e.area === area)
    .filter((e) => (excludeToday ? e.date > today : e.date >= today) && e.date <= horizon)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
    );

  if (events.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg">On your calendar</h2>
      <div className="space-y-1">
        {events.map((e) => (
          <EventRow key={e.id} event={e} today={today} />
        ))}
      </div>
    </section>
  );
}
