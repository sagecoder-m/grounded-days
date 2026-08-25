/**
 * Converts between this app's CalEvent and DayFlow's Event model.
 *
 * Two decisions carry the integration:
 *
 * 1. Each Grounded *area* becomes its own DayFlow calendar (`personal`,
 *    `professional`, `education`), so DayFlow's own area-colour rendering
 *    replaces the dotColor() lookup the hand-rolled board used to do by hand.
 *    Each synced *provider* becomes one read-only calendar (`google`,
 *    `microsoft`, `ical`), which is what DayFlow's own permission resolver reads to
 *    disable dragging — no per-item isSynced() check needed at render time,
 *    the library enforces it.
 *
 *    Per provider, not per connection, because CalEvent only records which
 *    provider an event came from (`source`) and not which account. Splitting
 *    two connected Google accounts into separate calendars would need a
 *    connection id on the event row first; until then a second Google account
 *    joins the same read-only bucket, which affects only the calendar's label,
 *    never whether the event is locked.
 *
 * 2. Tasks ARE drawn on the grid, as all-day items on their due date.
 *
 *    This used to be the opposite, on the reasoning that DayFlow has no concept
 *    of "done" and tasks had their own list beside the calendar. The second half
 *    of that stopped being true when the task list moved to the Overview: the
 *    calendar page kept the rule and lost the list, so a task due Thursday was
 *    nowhere on the one screen whose whole job is telling you what Thursday
 *    holds. A due date is a commitment on a specific day, which is the only
 *    thing a calendar is for.
 *
 *    "Done" is carried in the title as a box glyph rather than modelled, since
 *    DayFlow genuinely has no field for it. Tasks reuse the area calendars, so
 *    the area filter narrows them exactly as it narrows events.
 */
import {
  dateToPlainDate,
  dateToPlainDateTime,
  isPlainDate,
  plainDateTimeToDate,
  plainDateToDate,
} from "@dayflow/react";
import type { CalendarType, Event as DayFlowEvent } from "@dayflow/core";

import type { Area, CalEvent, Goal, Task } from "@/lib/store-types";
import type { CalendarConnection } from "@/lib/store-types";

const AREA_COLORS: Record<Area, { eventColor: string; lineColor: string; textColor: string }> = {
  personal: {
    eventColor: "var(--sage-soft)",
    lineColor: "var(--sage)",
    textColor: "var(--sage-deep)",
  },
  professional: {
    eventColor: "var(--brown-soft)",
    lineColor: "var(--brown)",
    textColor: "var(--brown)",
  },
  education: { eventColor: "var(--clay-soft)", lineColor: "var(--clay)", textColor: "var(--clay)" },
};

/** Areas with no goal/task/habit relevance in a calendar sense, but events can
 *  lack an area entirely (a synced event with no mapped default). */
const UNASSIGNED_COLOR = {
  eventColor: "var(--tan)",
  lineColor: "var(--ink-soft)",
  textColor: "var(--ink)",
};

export function calendarIdFor(event: CalEvent): string {
  if (event.source === "local") return event.area ?? "unassigned";
  /**
   * One calendar per connection, keyed by its id.
   *
   * This used to return the provider alone, which merged every account of the
   * same kind into one bucket: connect two Google calendars and the second was
   * indistinguishable from the first, with the registry naming only one of them.
   * The connection id is the only thing that separates them.
   *
   * The provider stays in the key as a readable prefix; the id is what makes it
   * unique. An older row with no connection_id falls back to the provider so it
   * still resolves to a calendar rather than disappearing.
   */
  return event.connectionId ? `${event.source}:${event.connectionId}` : event.source;
}

/**
 * Build the full CalendarType[] DayFlow needs, from the areas that always
 * exist plus whichever calendar connections are actually connected.
 */
/** A feed has no account name, so its host stands in — enough to tell two
 *  subscriptions apart without printing a whole URL into the calendar list. */
function feedLabel(feedUrl?: string): string | undefined {
  if (!feedUrl) return undefined;
  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function buildCalendarTypes(connections: CalendarConnection[]): CalendarType[] {
  const areaCalendars: CalendarType[] = (Object.keys(AREA_COLORS) as Area[]).map((area) => ({
    id: area,
    name: area.charAt(0).toUpperCase() + area.slice(1),
    colors: { ...AREA_COLORS[area], eventSelectedColor: AREA_COLORS[area].lineColor },
    isDefault: area === "personal",
  }));

  const unassigned: CalendarType = {
    id: "unassigned",
    name: "Unsorted",
    colors: { ...UNASSIGNED_COLOR, eventSelectedColor: UNASSIGNED_COLOR.lineColor },
  };

  /**
   * One calendar per connection.
   *
   * Previously deduplicated by provider, which was the right call while
   * calendarIdFor() keyed on the provider — but it capped a person at one
   * account per kind. Keying on the connection id lets someone hold two Google
   * calendars, or a Google and two feeds, and see which is which.
   */
  const syncedCalendars: CalendarType[] = connections.map((conn) => {
    const provider = conn.provider;
    const label =
      provider === "google"
        ? "Google Calendar"
        : provider === "microsoft"
          ? "Outlook Calendar"
          : "Calendar feed";
    // With several accounts of one kind the name is the only way to tell them
    // apart, so it carries the account: "Google Calendar (me@gmail.com)".
    const who = conn.accountEmail ?? feedLabel(conn.feedUrl);

    return {
      id: `${provider}:${conn.id}`,
      name: who ? `${label} (${who})` : label,
      colors: { ...UNASSIGNED_COLOR, eventSelectedColor: UNASSIGNED_COLOR.lineColor },
      // This is the actual lockdown: DayFlow's permission resolver checks this
      // per-calendar flag before allowing a drag, so a synced event cannot be
      // moved even though rendering treats it like any other event.
      readOnly: true,
      source: who ? `${label} · ${who}` : label,
    };
  });

  return [...areaCalendars, unassigned, ...syncedCalendars];
}

export function toDayFlowEvent(event: CalEvent): DayFlowEvent {
  const start = event.startsAt ? new Date(event.startsAt) : new Date(`${event.date}T00:00:00`);
  // A multi-day event ends on its last day, not the day it started. endDate is
  // inclusive in this app's model, so an event from the 1st to the 3rd covers
  // three days; DayFlow is given that last day directly.
  const lastDay = event.endDate ?? event.date;
  const end = event.endsAt
    ? new Date(event.endsAt)
    : event.startsAt
      ? new Date(new Date(event.startsAt).getTime() + 30 * 60_000)
      : new Date(`${lastDay}T23:59:59`);

  return {
    id: event.id,
    title: event.title,
    // All-day events use PlainDate, which is how DayFlow's model expresses "no
    // meaningful instant" — the same thing CalEvent means by a null startsAt.
    // Timed events use PlainDateTime. Both come from DayFlow's own converters
    // rather than hand-built Temporal objects, so there is no risk of an
    // instance mismatch against whatever Temporal polyfill version
    // @dayflow/core bundles internally.
    start: event.allDay ? dateToPlainDate(start) : dateToPlainDateTime(start),
    end: event.allDay ? dateToPlainDate(end) : dateToPlainDateTime(end),
    allDay: event.allDay,
    calendarId: calendarIdFor(event),
    meta: { groundedId: event.id, source: event.source, htmlLink: event.htmlLink },
  };
}

/** The inverse of toDayFlowEvent, for turning a drag/resize result back into
 *  the patch shape actions.updateEvent expects. */
export function fromDayFlowEvent(event: DayFlowEvent): {
  date: string;
  endDate?: string;
  startsAt?: string;
  endsAt?: string;
} {
  // Branch on the Temporal type rather than on event.allDay, because after a
  // drag the two can disagree: DayFlow rewrites start/end when an event is
  // dropped between the all-day strip and the time grid, and passing a
  // PlainDate to plainDateTimeToDate throws rather than degrading.
  const toDate = (value: DayFlowEvent["start"]) =>
    isPlainDate(value) ? plainDateToDate(value) : plainDateTimeToDate(value as never);

  const start = toDate(event.start);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate(),
  ).padStart(2, "0")}`;

  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (isPlainDate(event.start)) {
    /**
     * A dragged multi-day event has to carry its end with it.
     *
     * Returning only `date` would move the start and leave end_date on the old
     * day — which the events_end_date_after_start constraint rejects outright,
     * so the save would fail rather than degrade. Undefined when the event
     * lands on a single day, which is how the column expresses "one day".
     */
    const last = key(toDate(event.end));
    return { date, endDate: last !== date ? last : undefined };
  }
  return { date, startsAt: start.toISOString(), endsAt: toDate(event.end).toISOString() };
}

/**
 * Namespace for task ids on the grid.
 *
 * Tasks and events share one id space once they are both DayFlow events, and a
 * uuid gives no hint which table it came from. The prefix is what lets a drag or
 * a click route to the right action instead of asking the events list and
 * silently doing nothing when it is not there.
 */
export const TASK_EVENT_PREFIX = "task:";

export function isTaskEventId(id: string): boolean {
  return id.startsWith(TASK_EVENT_PREFIX);
}

export function taskIdFromEventId(id: string): string {
  return id.slice(TASK_EVENT_PREFIX.length);
}

/**
 * A dated task as an all-day DayFlow event.
 *
 * All-day rather than timed because a due date says which day, not which hour —
 * inventing 9am would be inventing information, and it would push the task into
 * the time grid where it would collide with real appointments.
 *
 * Completed tasks stay visible but faded. Hiding them would make a day look
 * emptier the more of it you got through, which is both wrong and, on a page
 * meant to feel calm, discouraging in precisely the way this app avoids.
 */
export function taskToDayFlowEvent(task: Task & { date: string }): DayFlowEvent {
  // Parsed with an explicit local midnight, never new Date("yyyy-mm-dd"), which
  // is UTC midnight and lands on the previous day west of Greenwich.
  const day = dateToPlainDate(new Date(`${task.date}T00:00:00`));
  return {
    id: `${TASK_EVENT_PREFIX}${task.id}`,
    // A box rather than a colour, so "done" survives being read in greyscale and
    // does not need a legend.
    title: `${task.done ? "\u2611" : "\u2610"} ${task.title}`,
    start: day,
    end: day,
    allDay: true,
    calendarId: task.area,
    meta: { groundedId: task.id, source: "task", done: task.done },
  };
}

/** Namespace for goals on the grid, for the same reason tasks have one. */
export const GOAL_EVENT_PREFIX = "goal:";

export function isGoalEventId(id: string): boolean {
  return id.startsWith(GOAL_EVENT_PREFIX);
}

export function goalIdFromEventId(id: string): string {
  return id.slice(GOAL_EVENT_PREFIX.length);
}

/**
 * A goal with a target date, as an all-day item on that day.
 *
 * Marked with a flag rather than a checkbox, because a goal is not a thing you
 * tick — it has a percentage, and the glyph should not imply otherwise. The
 * progress rides in the title for the same reason the task's box does: DayFlow
 * has no field for it, and a number in the label survives every view.
 */
export function goalToDayFlowEvent(goal: Goal & { targetDate: string }): DayFlowEvent {
  const day = dateToPlainDate(new Date(`${goal.targetDate}T00:00:00`));
  return {
    id: `${GOAL_EVENT_PREFIX}${goal.id}`,
    title: `\u2691 ${goal.name}${goal.progress > 0 ? ` \u00b7 ${goal.progress}%` : ""}`,
    start: day,
    end: day,
    allDay: true,
    calendarId: goal.area,
    meta: { groundedId: goal.id, source: "goal", progress: goal.progress },
  };
}
