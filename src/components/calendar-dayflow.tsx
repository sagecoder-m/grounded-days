/**
 * The calendar, rendered by DayFlow.
 *
 * Replaces the hand-rolled calendar-board.tsx. The board drew its own week,
 * month and year grids and moved events with the HTML5 drag-and-drop API, which
 * does not fire on touch at all — dragging an event on a phone was silently
 * impossible. DayFlow's drag runs on pointer events, so the same gesture works
 * with a finger, and its per-calendar readOnly flag enforces the one rule that
 * actually matters here: a synced event from Google or Outlook must never be
 * moved, because the database rejects client writes to it.
 *
 * That lockdown is enforced by the library, not by this file. Areas and synced
 * providers are mapped to DayFlow calendars in dayflow-adapter.ts, and DayFlow's
 * own permission resolver refuses the drag before any callback fires — verified
 * by dragging a synced event and observing that onEventDrop is never reached.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createDragPlugin } from "@dayflow/plugin-drag";
import {
  DayFlowCalendar,
  createAgendaView,
  createMonthView,
  createWeekView,
  createYearView,
  useCalendarApp,
} from "@dayflow/react";
import { ViewType, type Event as DayFlowEvent } from "@dayflow/core";

import { actions, useAppState } from "@/lib/store";
import type { CalEvent, CalView } from "@/lib/store-types";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { conflictingEventIds } from "@/lib/schedule";
import { useSession } from "@/lib/use-session";
import { buildCalendarTypes, fromDayFlowEvent, toDayFlowEvent } from "@/lib/dayflow-adapter";
import { useDayFlowEventSync } from "@/lib/use-dayflow-sync";
import { CalendarTasksPanel, dateKey } from "@/components/calendar-tasks-panel";
import { AddEventDialog, EditEventDialog, SyncedHint } from "@/components/calendar-dialogs";

/** The saved preference is week/month/year; DayFlow names the same three. */
const VIEW_FOR_SETTING: Record<CalView, ViewType> = {
  week: ViewType.WEEK,
  month: ViewType.MONTH,
  year: ViewType.YEAR,
};

export function CalendarDayFlow({ heading = "Schedule" }: { heading?: string }) {
  const state = useAppState();
  const { user } = useSession();
  const connections = useQuery({
    ...calendarConnectionsQuery(user?.id ?? ""),
    enabled: Boolean(user),
  });

  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  const calendars = useMemo(() => buildCalendarTypes(connections.data ?? []), [connections.data]);
  const events = useMemo(() => state.events.map(toDayFlowEvent), [state.events]);

  /**
   * Writes a drag or resize back through the same actions.updateEvent the old
   * board used, so the optimistic cache update and the Supabase write are
   * unchanged — this swap replaces the calendar, not the data path.
   *
   * The synced guard is belt-and-braces. DayFlow already refuses to drag an
   * event whose calendar is readOnly and RLS would reject the write anyway, but
   * a silent no-op beats an optimistic update that gets reverted on a failed
   * round trip.
   */
  const persistMove = useCallback((updated: DayFlowEvent) => {
    if ((updated.meta as { source?: string } | undefined)?.source !== "local") return;
    actions.updateEvent(updated.id, fromDayFlowEvent(updated));
  }, []);

  /** Synced events open nothing: there is no edit to offer, so a dialog would
   *  just be a dead end. Local ones open the app's own dialog rather than
   *  DayFlow's, to keep one editing surface across the app. */
  const onEventClick = useCallback(
    (clicked: DayFlowEvent) => {
      const match = state.events.find((e) => e.id === clicked.id);
      if (match && match.source === "local") setEditing(match);
    },
    [state.events],
  );

  const onVisibleRangeChange = useCallback((start: Date, end: Date) => {
    // Compared by date key, not by Date identity: DayFlow re-reports the range
    // on renders that are not a real change, and two fresh Dates are never ===,
    // so storing them unguarded would set state every report and spin.
    setRange((prev) =>
      prev && dateKey(prev.start) === dateKey(start) && dateKey(prev.end) === dateKey(end)
        ? prev
        : { start, end },
    );
  }, []);

  const views = useMemo(
    () => [
      createWeekView({}),
      createMonthView({ showEventDots: true }),
      createYearView({}),
      createAgendaView({}),
    ],
    [],
  );

  const plugins = useMemo(
    () => [createDragPlugin({ onEventDrop: persistMove, onEventResize: persistMove })],
    [persistMove],
  );

  const calendar = useCalendarApp({
    views,
    events,
    calendars,
    plugins,
    defaultCalendar: "personal",
    defaultView: VIEW_FOR_SETTING[state.settings.defaultCalView] ?? ViewType.MONTH,
    callbacks: { onVisibleRangeChange, onEventClick },
    // The rest of the app writes times as "4:00am"; DayFlow defaults to 24h,
    // which made one event read two different ways on two pages.
    timeFormat: "12h",
  });

  // The events passed above are only the first-render snapshot as far as
  // DayFlow is concerned; this is what keeps it in step with the query.
  useDayFlowEventSync(calendar, events);

  /**
   * Conflict highlighting, carried over from the Smart Schedule work.
   *
   * Done as a stylesheet keyed on data-event-id rather than a custom event
   * renderer: DayFlow renders through Preact and @dayflow/react does not bridge
   * its eventContent slots, so handing it React nodes would mean mixing two
   * element types. A rule per conflicted id needs no custom rendering at all
   * and cannot break the reconciler.
   */
  const conflictCss = useMemo(() => {
    const ids = [...conflictingEventIds(state.events)];
    if (ids.length === 0) return null;
    const selector = ids.map((id) => `.df-event[data-event-id="${CSS.escape(id)}"]`).join(",");
    // An inset shadow rather than a border, so nothing reflows by a pixel when
    // an event becomes conflicted.
    return `${selector}{box-shadow:inset 0 0 0 1.5px var(--clay);}`;
  }, [state.events]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">{heading}</h2>
        <div className="flex items-center gap-2">
          <SyncedHint />
          <AddEventDialog defaultDate={range ? dateKey(range.start) : undefined} />
        </div>
      </div>

      {conflictCss && <style>{conflictCss}</style>}

      {/* Calendar and tasks side by side on wide screens, stacked on narrow — a
          task list squeezed beside a month grid on a phone would leave neither
          enough room. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0 h-[32rem] md:h-[42rem]">
          <DayFlowCalendar calendar={calendar} />
        </div>
        <CalendarTasksPanel
          tasks={state.tasks}
          rangeStart={range?.start ?? null}
          rangeEnd={range?.end ?? null}
        />
      </div>

      {editing && <EditEventDialog event={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
