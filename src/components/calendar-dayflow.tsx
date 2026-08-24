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
  createDayView,
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
import { dateKey } from "@/components/task-grid";
import { AddEventDialog, EditEventDialog, SyncedHint } from "@/components/calendar-dialogs";
import { useMediaQuery } from "@/lib/use-media-query";

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

  // Matches Tailwind's md. False during SSR and the first paint, which lands on
  // the desktop view set — the safer default, since every view it offers exists
  // at every width.
  const narrow = useMediaQuery("(max-width: 767px)");

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

  /**
   * Phones get a day view and lose the year view.
   *
   * A week grid on a 375px screen is 634px of columns in a 341px viewport —
   * DayFlow keeps a minimum column width, so half the week sits off-screen
   * behind a sideways swipe. A single day fits, and DayFlow's compact header is
   * already a day picker, so the two were built to go together.
   *
   * Year goes because twelve month grids in a phone-width column is unreadable,
   * and because the switcher only has room for four before it wraps.
   */
  const views = useMemo(() => {
    // The same preference that sets the habit grid's first column, so a week
    // does not start on different days on two pages of one app.
    const startOfWeek = state.settings.weekStartsOn;
    const week = createWeekView({ startOfWeek });
    const month = createMonthView({ showEventDots: true, startOfWeek });

    return narrow
      ? [createDayView({}), week, month, createAgendaView({})]
      : [createDayView({}), week, month, createYearView({}), createAgendaView({})];
  }, [narrow, state.settings.weekStartsOn]);

  const plugins = useMemo(
    () => [createDragPlugin({ onEventDrop: persistMove, onEventResize: persistMove })],
    [persistMove],
  );

  const calendar = useCalendarApp(
    {
      views,
      events,
      calendars,
      plugins,
      defaultCalendar: "personal",
      // On a phone the saved week/month/year preference is overridden to day,
      // because the saved value was chosen on a screen where a week fits.
      defaultView: narrow
        ? ViewType.DAY
        : (VIEW_FOR_SETTING[state.settings.defaultCalView] ?? ViewType.MONTH),
      callbacks: { onVisibleRangeChange, onEventClick },
      // The rest of the app writes times as "4:00am"; DayFlow defaults to 24h,
      // which made one event read two different ways on two pages.
      timeFormat: "12h",
    },
    // useCalendarApp builds its CalendarApp in a useMemo keyed only on this
    // version, so a changed view set is otherwise ignored. Rebuilding on the
    // breakpoint is the point — it is the one case where losing the current
    // view is correct, since that view may no longer exist.
    `${narrow ? "narrow" : "wide"}:${state.settings.weekStartsOn}`,
  );

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

      {/* Full width. Tasks used to sit in a panel beside the grid; they live on
          the Overview now, so the calendar is not competing with a list for
          horizontal room and the day columns get all of it. */}
      <div className="h-[32rem] md:h-[42rem]">
        <DayFlowCalendar calendar={calendar} />
      </div>

      {editing && <EditEventDialog event={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
