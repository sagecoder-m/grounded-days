/**
 * Schedule reasoning shared by the calendar board and the Overview day view.
 */
import type { CalEvent } from "@/lib/store-types";

/** An event with no end time is treated as this long when checking overlaps. */
const ASSUMED_MINUTES = 30;

interface Span {
  id: string;
  start: number;
  end: number;
}

function spanFor(event: CalEvent): Span | null {
  // All-day events do not conflict with anything: two things happening "today"
  // is not a clash, and flagging it would make every all-day item noise.
  if (event.allDay || !event.startsAt) return null;
  const start = Date.parse(event.startsAt);
  if (Number.isNaN(start)) return null;
  const parsedEnd = event.endsAt ? Date.parse(event.endsAt) : NaN;
  const end =
    !Number.isNaN(parsedEnd) && parsedEnd > start ? parsedEnd : start + ASSUMED_MINUTES * 60_000;
  return { id: event.id, start, end };
}

/**
 * Ids of events that overlap at least one other event in time.
 *
 * Reported as a flat set rather than pairs: the useful thing on a calendar is
 * "this one is double-booked", and rendering which-clashes-with-which turns a
 * glance into a puzzle. Touching ends do not count — a 2:00–3:00 followed by a
 * 3:00–4:00 is a normal day, not a conflict.
 */
export function conflictingEventIds(events: CalEvent[]): Set<string> {
  const spans = events.map(spanFor).filter((s): s is Span => s !== null);
  spans.sort((a, b) => a.start - b.start);

  const conflicted = new Set<string>();
  // Sorted by start, so only the running maximum end needs comparing against —
  // no need for the full pairwise sweep.
  let furthest: Span | null = null;
  for (const span of spans) {
    if (furthest && span.start < furthest.end) {
      conflicted.add(span.id);
      conflicted.add(furthest.id);
    }
    if (!furthest || span.end > furthest.end) furthest = span;
  }
  return conflicted;
}

/**
 * Move a dated thing to another day, keeping the time of day.
 *
 * Changing only `date` on a timed event would leave starts_at pointing at the
 * old day — the row would disagree with itself, and the day view sorts by
 * starts_at while the board filters by date.
 */
export function shiftToDate(
  event: Pick<CalEvent, "startsAt" | "endsAt" | "allDay">,
  targetDate: string,
): { date: string; startsAt?: string; endsAt?: string } {
  if (event.allDay || !event.startsAt) return { date: targetDate };

  const originalStart = new Date(event.startsAt);
  if (Number.isNaN(originalStart.getTime())) return { date: targetDate };

  const [y, m, d] = targetDate.split("-").map(Number);
  const newStart = new Date(originalStart);
  newStart.setFullYear(y, m - 1, d);

  // The end is derived from the duration rather than stamped with the same
  // date: an event running past midnight would otherwise collapse to a
  // negative length when both ends were forced onto the target day.
  const originalEnd = event.endsAt ? new Date(event.endsAt) : null;
  const duration =
    originalEnd && !Number.isNaN(originalEnd.getTime())
      ? originalEnd.getTime() - originalStart.getTime()
      : null;

  return {
    date: targetDate,
    startsAt: newStart.toISOString(),
    endsAt:
      duration !== null && duration > 0
        ? new Date(newStart.getTime() + duration).toISOString()
        : undefined,
  };
}
