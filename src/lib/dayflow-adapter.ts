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
 * 2. Tasks are not represented as DayFlow events. DayFlow has no concept of
 *    "done", and forcing a checklist item into an event model to get it drawn
 *    on a grid is the wrong direction — tasks render in their own list beside
 *    the calendar, the same split the Overview day view already uses.
 */
import {
  dateToPlainDate,
  dateToPlainDateTime,
  isPlainDate,
  plainDateTimeToDate,
  plainDateToDate,
} from "@dayflow/react";
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
  return event.source;
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

  // Deduplicated by provider, because calendarIdFor() resolves a synced event
  // to its provider. Mapping connections straight through would emit two
  // calendars sharing the id "google" the moment a second Google account is
  // connected, and a registry with duplicate ids has no defined winner.
  const providers = [...new Set(connections.map((conn) => conn.provider))];

  const syncedCalendars: CalendarType[] = providers.map((provider) => {
    // A feed is read-only for the same reason the OAuth providers are, so it
    // needs a label here or it would fall through to "Outlook Calendar".
    const label =
      provider === "google"
        ? "Google Calendar"
        : provider === "microsoft"
          ? "Outlook Calendar"
          : "Calendar feed";
    const forProvider = connections.filter((conn) => conn.provider === provider);
    // The account email is only informative while it is unambiguous; with two
    // accounts in one bucket, naming one of them would be actively misleading.
    const single = forProvider.length === 1 ? forProvider[0].accountEmail : undefined;

    return {
      id: provider,
      name: single ? `${label} (${single})` : label,
      colors: { ...UNASSIGNED_COLOR, eventSelectedColor: UNASSIGNED_COLOR.lineColor },
      // This is the actual lockdown: DayFlow's permission resolver checks this
      // per-calendar flag before allowing a drag, so a synced event cannot be
      // moved even though rendering treats it like any other event.
      readOnly: true,
      source: label,
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
