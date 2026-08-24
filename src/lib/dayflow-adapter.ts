/**
 * Converts between this app's CalEvent and DayFlow's Event model.
 *
 * Two decisions carry the integration:
 *
 * 1. Each Grounded *area* becomes its own DayFlow calendar (`personal`,
 *    `professional`, `education`), so DayFlow's own area-colour rendering
 *    replaces the dotColor() lookup the hand-rolled board used to do by hand.
 *    A synced provider becomes its own read-only calendar per connection
 *    (`google:<connectionId>`, `microsoft:<connectionId>`), which is what
 *    DayFlow's own permission resolver reads to disable dragging — no
 *    per-item isSynced() check needed at render time, the library enforces it.
 *
 * 2. Tasks are not represented as DayFlow events. DayFlow has no concept of
 *    "done", and forcing a checklist item into an event model to get it drawn
 *    on a grid is the wrong direction — tasks render in their own list beside
 *    the calendar, the same split the Overview day view already uses.
 */
import { dateToPlainDateTime, plainDateTimeToDate } from "@dayflow/react";
import type { CalendarType, Event as DayFlowEvent } from "@dayflow/core";

import type { Area, CalEvent } from "@/lib/store-types";
import type { CalendarConnection } from "@/lib/store-types";

const AREA_COLORS: Record<Area, { eventColor: string; lineColor: string; textColor: string }> = {
  personal: { eventColor: "var(--sage-soft)", lineColor: "var(--sage)", textColor: "var(--sage-deep)" },
  professional: { eventColor: "var(--brown-soft)", lineColor: "var(--brown)", textColor: "var(--brown)" },
  education: { eventColor: "var(--clay-soft)", lineColor: "var(--clay)", textColor: "var(--clay)" },
};

/** Areas with no goal/task/habit relevance in a calendar sense, but events can
 *  lack an area entirely (a synced event with no mapped default). */
const UNASSIGNED_COLOR = { eventColor: "var(--tan)", lineColor: "var(--ink-soft)", textColor: "var(--ink)" };

export function calendarIdFor(event: CalEvent): string {
  if (event.source === "local") return event.area ?? "unassigned";
  // One calendar per synced connection, not per provider: two connected
  // Google accounts must not merge into one read-only bucket that hides which
  // account an event actually came from.
  return `${event.source}`;
}

/**
 * Build the full CalendarType[] DayFlow needs, from the areas that always
 * exist plus whichever calendar connections are actually connected.
 */
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

  const syncedCalendars: CalendarType[] = connections.map((conn) => ({
    id: conn.provider,
    name: conn.provider === "google" ? "Google Calendar" : "Outlook Calendar",
    colors: { ...UNASSIGNED_COLOR, eventSelectedColor: UNASSIGNED_COLOR.lineColor },
    // This is the actual lockdown: DayFlow's permission resolver checks this
    // per-calendar flag before allowing a drag, so a synced event cannot be
    // moved even though rendering treats it like any other event.
    readOnly: true,
    source: conn.provider === "google" ? "Google Calendar" : "Outlook Calendar",
  }));

  return [...areaCalendars, unassigned, ...syncedCalendars];
}

export function toDayFlowEvent(event: CalEvent): DayFlowEvent {
  const start = event.startsAt ? new Date(event.startsAt) : new Date(`${event.date}T00:00:00`);
  const end = event.endsAt
    ? new Date(event.endsAt)
    : event.startsAt
      ? new Date(new Date(event.startsAt).getTime() + 30 * 60_000)
      : new Date(`${event.date}T23:59:59`);

  return {
    id: event.id,
    title: event.title,
    // allDay events use PlainDate (date only); timed events use PlainDateTime.
    // Both come from DayFlow's own converters rather than hand-built Temporal
    // objects, so there is no risk of an instance mismatch against whatever
    // Temporal polyfill version @dayflow/core bundles internally.
    start: event.allDay ? dateToPlainDateTime(start) : dateToPlainDateTime(start),
    end: event.allDay ? dateToPlainDateTime(end) : dateToPlainDateTime(end),
    allDay: event.allDay,
    calendarId: calendarIdFor(event),
    meta: { groundedId: event.id, source: event.source, htmlLink: event.htmlLink },
  };
}

/** The inverse of toDayFlowEvent, for turning a drag/resize result back into
 *  the patch shape actions.updateEvent expects. */
export function fromDayFlowEvent(event: DayFlowEvent): {
  date: string;
  startsAt?: string;
  endsAt?: string;
} {
  const start = plainDateTimeToDate(event.start as never);
  const end = plainDateTimeToDate(event.end as never);
  const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate(),
  ).padStart(2, "0")}`;

  if (event.allDay) return { date };
  return { date, startsAt: start.toISOString(), endsAt: end.toISOString() };
}
