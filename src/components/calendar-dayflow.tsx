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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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

import { actions, useAppState, useSettingsLoaded } from "@/lib/store";
import type { Area, CalEvent, CalView } from "@/lib/store-types";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { conflictingEventIds } from "@/lib/schedule";
import { useSession } from "@/lib/use-session";
import { useResolvedTheme } from "@/lib/use-theme";
import {
  buildCalendarTypes,
  fromDayFlowEvent,
  goalIdFromEventId,
  goalToDayFlowEvent,
  isGoalEventId,
  isTaskEventId,
  taskIdFromEventId,
  taskToDayFlowEvent,
  toDayFlowEvent,
} from "@/lib/dayflow-adapter";
import { useDayFlowEventSync } from "@/lib/use-dayflow-sync";
import { dateKey } from "@/lib/dates";
import {
  AddEventDialog,
  EditEventDialog,
  SyncedHint,
  type EventDraft,
} from "@/components/calendar-dialogs";
import { useMediaQuery } from "@/lib/use-media-query";
import { CALENDAR_BOX, CalendarGridSkeleton } from "@/components/calendar-skeleton";

const FILTER_AREAS: { key: Area; label: string; dot: string }[] = [
  { key: "personal", label: "Personal", dot: "var(--sage)" },
  { key: "professional", label: "Professional", dot: "var(--brown)" },
  { key: "education", label: "Education", dot: "var(--clay)" },
];

/**
 * Show only some areas.
 *
 * Nothing selected means everything, rather than nothing — a filter you have not
 * touched should not be hiding your calendar. Selecting an area narrows to it;
 * selecting it again clears back to all.
 *
 * Imported events are never filtered out. They belong to no area, so there is
 * nothing to match, and hiding them would mean narrowing to Education removed
 * the very lecture you were filtering around. The filter narrows what you wrote
 * down; the schedule you do not control stays.
 */
function AreaFilter({
  selected,
  onChange,
}: {
  selected: Set<Area>;
  onChange: (next: Set<Area>) => void;
}) {
  const toggle = (area: Area) => {
    const next = new Set(selected);
    if (next.has(area)) next.delete(area);
    else next.add(area);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTER_AREAS.map((a) => {
        const on = selected.has(a.key);
        return (
          <button
            key={a.key}
            onClick={() => toggle(a.key)}
            aria-pressed={on}
            title={on ? `Stop filtering by ${a.label}` : `Show only ${a.label}`}
            className={`chip transition-colors ${
              on ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: on ? "currentColor" : a.dot }}
            />
            {a.label}
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          onClick={() => onChange(new Set())}
          className="text-[11px] text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          Show all
        </button>
      )}
    </div>
  );
}

/** The saved preference is week/month/year; DayFlow names the same three. */
const VIEW_FOR_SETTING: Record<CalView, ViewType> = {
  week: ViewType.WEEK,
  month: ViewType.MONTH,
  year: ViewType.YEAR,
};

/**
 * Waits for the two things the calendar is *built* from before building it.
 *
 * The glitch this fixes was visible on every single visit to the tab: the grid
 * appeared as a week, then a beat later redrew as a month, with both painted
 * over each other in between — two month captions stamped across the grid.
 *
 * Nothing was wrong with the calendar. It was being built twice from data that
 * had not arrived yet. useCalendarApp memoises its CalendarApp on a version
 * string, and ours contains the calendar-connection signature, which starts
 * empty and changes the moment that query resolves — so the app was rebuilt,
 * and rebuilding "discards the current view and date" as the note on that
 * signature already says. The first build also read defaultCalView from
 * DEFAULT_SETTINGS, whose value is "week", so the throwaway build opened on a
 * week grid regardless of the month the person had actually chosen.
 *
 * Both are the same mistake the theme had: a default that is a real, applicable
 * answer is indistinguishable from a loaded one, so the app acts on it. The fix
 * is the same too — do nothing until the answer is real. A calendar that takes
 * one more moment to appear and then simply *is* the right view beats one that
 * appears instantly as the wrong one and corrects itself in front of you.
 *
 * The gate is a separate component, not an early return, because the hooks
 * below must not run against placeholder data at all — an early return after
 * them would still build the throwaway app.
 */
export function CalendarDayFlow({ heading = "Schedule" }: { heading?: string }) {
  const { user } = useSession();
  const settingsLoaded = useSettingsLoaded();
  const connections = useQuery({
    ...calendarConnectionsQuery(user?.id ?? ""),
    enabled: Boolean(user),
  });

  /*
    Ready when there is nothing left to wait for — which includes the case where
    there was never anything to wait for.

    Both halves need the `!user` escape, and the first one caught me: with no
    signed-in user the settings query is disabled, so it never resolves and
    `settingsLoaded` stays false forever. Gating on it alone left the calendar as
    a skeleton that never became a calendar. It is behind the auth gate in the
    app, so this would not have shown in normal use — which is exactly why it is
    worth the guard rather than the assumption.

    `data !== undefined` rather than isSuccess, for the same reason: a disabled
    query is not a failed one, and it never succeeds either.
  */
  const ready = !user || (settingsLoaded && connections.data !== undefined);

  /*
    The same block the route's pending component draws, deliberately.

    This state and that one are consecutive — the router hands over the moment
    the chunk lands, and this then waits for the queries — so if they look
    different the handover is a visible flash. Drawn from one shared component
    so they cannot drift apart the next time either is touched.
  */
  if (!ready) return <CalendarGridSkeleton heading={heading} />;

  return <CalendarBoard heading={heading} />;
}

function CalendarBoard({ heading }: { heading: string }) {
  const state = useAppState();
  const { user } = useSession();
  const connections = useQuery({
    ...calendarConnectionsQuery(user?.id ?? ""),
    enabled: Boolean(user),
  });

  /**
   * Which areas are shown. Empty means all — a filter nobody has touched should
   * not be hiding anything.
   *
   * Applied to the events handed to DayFlow rather than by toggling calendar
   * visibility in the registry: the events array is already reconciled on every
   * change by use-dayflow-sync, so filtering it needs no new machinery and
   * cannot fall out of step with what is drawn.
   */
  const [areaFilter, setAreaFilter] = useState<Set<Area>>(new Set());
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  /** What a drag or a right-click "New event" just carved out of the grid,
   *  waiting to be named — see onEventCreate below and AddEventDialog's
   *  `draft` prop for why this has to go through a dialog rather than
   *  being saved on the spot. */
  const [createDraft, setCreateDraft] = useState<EventDraft | null>(null);

  // Matches Tailwind's md. False during SSR and the first paint, which lands on
  // the desktop view set — the safer default, since every view it offers exists
  // at every width.
  const narrow = useMediaQuery("(max-width: 767px)");

  const calendars = useMemo(() => buildCalendarTypes(connections.data ?? []), [connections.data]);

  /**
   * Part of the version key below, and the fix for a real bug.
   *
   * useCalendarApp builds its CalendarApp in a useMemo keyed only on `version`,
   * and the calendars registry is captured at that moment. Connections arrive
   * from a query a tick after mount, so the registry was always built empty —
   * and DayFlow does not render an event whose calendarId it has never been
   * told about. Synced events were therefore in the database, inside the visible
   * range, mapped to a calendar id, and invisible: "Summer Bank Holiday" existed
   * on Aug 31 and simply did not draw.
   *
   * Keying on the connection ids means the app is rebuilt when the set changes —
   * once shortly after load, then only when a calendar is connected or removed.
   * Rebuilding discards the current view and date, which is why events are
   * reconciled imperatively instead (see use-dayflow-sync); connections change
   * rarely enough that paying it here is the right trade.
   */
  const connectionSignature = useMemo(
    () =>
      (connections.data ?? [])
        // The area is in the signature, not just the id. A calendar's colour
        // comes from its area, and the registry is captured when the app is
        // built — keyed on ids alone, moving a calendar from Personal to
        // Education changed the events in the database and left them the old
        // colour on screen until a reload.
        .map((c) => `${c.id}:${c.defaultArea ?? "-"}`)
        .sort()
        .join(","),
    [connections.data],
  );
  const events = useMemo(() => {
    const visible =
      areaFilter.size === 0
        ? state.events
        : state.events.filter(
            // Imported events always show. They carry no area, so an area filter
            // has nothing to match them against — and hiding them would mean
            // narrowing to Education quietly removed the lecture you are
            // filtering around. The filter narrows your own events; the
            // schedule you do not control stays put.
            (e) => e.source !== "local" || (e.area && areaFilter.has(e.area)),
          );
    /**
     * Dated tasks, drawn alongside events.
     *
     * Only dated ones: a task with no due date is not on any day, and putting it
     * on today because it has to go somewhere would invent a deadline nobody
     * set — in an app built to avoid manufactured pressure, that is the wrong
     * kind of wrong.
     *
     * Tasks always carry an area, so unlike imported events they answer the area
     * filter directly and are narrowed by it.
     */
    const tasks = state.tasks.filter(
      (t): t is typeof t & { date: string } =>
        Boolean(t.date) && (areaFilter.size === 0 || areaFilter.has(t.area)),
    );

    /** Goals that are aimed at a particular day. Most have no target date, and
     *  those stay off the grid — there is no day to put them on. */
    const goals = state.goals.filter(
      (g): g is typeof g & { targetDate: string } =>
        Boolean(g.targetDate) && (areaFilter.size === 0 || areaFilter.has(g.area)),
    );

    /*
      How each course should read on the grid. The code when there is one,
      because that is what a syllabus, a portal and the student all call it;
      the name when there is not, since "Statistics" is a complete answer and
      an assignment with no course attached at all is worse than a long tag.
    */
    const courseTag = new Map(state.courses.map((c) => [c.id, c.code || c.name]));

    return [
      ...visible.map(toDayFlowEvent),
      ...tasks.map((t) =>
        taskToDayFlowEvent(t, t.courseId ? courseTag.get(t.courseId) : undefined),
      ),
      ...goals.map(goalToDayFlowEvent),
    ];
  }, [state.events, state.tasks, state.goals, state.courses, areaFilter]);

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
    // Dragging a task re-dates it. This is the one edit the calendar is better
    // at than the task list: "not today, Thursday" is a gesture here and a date
    // picker there.
    if (isTaskEventId(updated.id)) {
      actions.updateTask(taskIdFromEventId(updated.id), {
        date: fromDayFlowEvent(updated).date,
      });
      return;
    }
    // Dragging a goal moves what it is aiming at, which is the one thing about a
    // goal a calendar is the natural place to change.
    if (isGoalEventId(updated.id)) {
      actions.updateGoal(goalIdFromEventId(updated.id), {
        targetDate: fromDayFlowEvent(updated).date,
      });
      return;
    }
    if ((updated.meta as { source?: string } | undefined)?.source !== "local") return;
    actions.updateEvent(updated.id, fromDayFlowEvent(updated));
  }, []);

  /** Synced events open nothing: there is no edit to offer, so a dialog would
   *  just be a dead end. Local ones open the app's own dialog rather than
   *  DayFlow's, to keep one editing surface across the app. */
  const onEventClick = useCallback(
    (clicked: DayFlowEvent) => {
      // Tasks open nothing. Ticking one is a single irreversible-feeling click
      // with no undo, and a calendar grid is dense enough that a mis-click is
      // routine — so the box is shown here and ticked where there is a real
      // checkbox. Rescheduling, which a drag makes unambiguous, is offered.
      if (isTaskEventId(clicked.id) || isGoalEventId(clicked.id)) return;
      const match = state.events.find((e) => e.id === clicked.id);
      if (match && match.source === "local") setEditing(match);
    },
    [state.events],
  );

  /**
   * A drag or a right-click "New event" just carved a shape out of the grid.
   *
   * DayFlow hands over a bare event with that shape and no title — creating
   * a real one is left entirely to the host app, per its own docs. Nothing
   * was listening for this before, which is why the gesture visibly did
   * nothing: DayFlow's own reconciliation (useDayFlowEventSync, below) syncs
   * its internal event list to match `events` on every render, and `events`
   * never heard about a draft that only ever lived inside DayFlow — so the
   * very next render quietly erased it again.
   *
   * Converted through fromDayFlowEvent, the same adapter drag/resize already
   * use, then reformatted into the local wall-clock date/time strings the
   * dialog's plain <input type="date"/time"> fields expect — the adapter's
   * own output is a UTC instant, which is correct for the database and wrong
   * for a form field a person reads in their own timezone.
   */
  const onEventCreate = useCallback((created: DayFlowEvent) => {
    const { date, startsAt, endsAt } = fromDayFlowEvent(created);
    if (!startsAt) {
      setCreateDraft({ startDate: date, allDay: true });
      return;
    }
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    const startDate = format(start, "yyyy-MM-dd");
    const endDate = end ? format(end, "yyyy-MM-dd") : undefined;
    setCreateDraft({
      startDate,
      endDate: endDate && endDate !== startDate ? endDate : undefined,
      allDay: false,
      startTime: format(start, "HH:mm"),
      endTime: end ? format(end, "HH:mm") : undefined,
    });
  }, []);

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
    // Without this both time grids open at midnight, so the first thing you see
    // is eight empty hours and you have to scroll to find your own day.
    const week = createWeekView({ startOfWeek, scrollToCurrentTime: true });
    const month = createMonthView({ showEventDots: true, startOfWeek });

    return narrow
      ? [createDayView({ scrollToCurrentTime: true }), week, month, createAgendaView({})]
      : [
          createDayView({ scrollToCurrentTime: true }),
          week,
          month,
          createYearView({}),
          createAgendaView({}),
        ];
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
      callbacks: { onVisibleRangeChange, onEventClick, onEventCreate },
      // The rest of the app writes times as "4:00am"; DayFlow defaults to 24h,
      // which made one event read two different ways on two pages.
      timeFormat: "12h",
    },
    // useCalendarApp builds its CalendarApp in a useMemo keyed only on this
    // version, so a changed view set is otherwise ignored. Rebuilding on the
    // breakpoint is the point — it is the one case where losing the current
    // view is correct, since that view may no longer exist.
    `${narrow ? "narrow" : "wide"}:${state.settings.weekStartsOn}:${connectionSignature}`,
  );

  /*
    Tell DayFlow which theme it is in.

    Pointing its CSS variables at this app's tokens gets the chrome right, and
    that is genuinely all it gets: DayFlow also resolves event colours in
    JavaScript — resolveColors(), getLineColor(), getSelectedBgColor() — from a
    theme mode it keeps internally, and that mode defaults to light and never
    hears about the toggle. So the calendar sat in a dark app rendering
    light-mode event chips on a light-mode surface, which is exactly what it
    looked like: one cream panel in the middle of a dark page.

    Not "auto", which would take the mode from the operating system and put us
    straight back to the calendar disagreeing with the app whenever someone's
    machine is set the other way. The app's own resolved theme is the answer,
    including when that answer came from the OS via "Follow my device".
  */
  const resolvedTheme = useResolvedTheme(state.settings.theme);
  useEffect(() => {
    // setTheme lives on the app instance, not on the hook's return value.
    calendar?.app?.setTheme?.(resolvedTheme);
  }, [calendar, resolvedTheme]);

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
        <h2 className="font-serif text-lg">{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <AreaFilter selected={areaFilter} onChange={setAreaFilter} />
          <SyncedHint />
          <AddEventDialog
            defaultDate={range ? dateKey(range.start) : undefined}
            draft={createDraft}
            onDraftHandled={() => setCreateDraft(null)}
          />
        </div>
      </div>

      {conflictCss && <style>{conflictCss}</style>}

      {/* Full width. Tasks used to sit in a panel beside the grid; they live on
          the Overview now, so the calendar is not competing with a list for
          horizontal room and the day columns get all of it. */}
      {/*
        A fixed height, not a slice of the viewport.

        This was calc(100vh - 19rem) for a while, to get the whole calendar on
        screen without scrolling. It did that, but at the cost of the grid never
        being the same size twice: stretched rows on a tall monitor, squashed
        ones on a short laptop, and the hour heights drifting with the window.
        That inconsistency is what read as odd.

        A set height keeps an hour the same height everywhere, and the smaller
        page headings recovered enough room that 42rem still lands within a
        normal laptop window — so it fits on arrival without being tied to it.
      */}
      {/* The height comes from CALENDAR_BOX, which the placeholder uses too —
          they were separate values and drifted straight away, leaving a phone
          with a 640px stand-in in front of a 512px calendar. */}
      <div className={CALENDAR_BOX}>
        <DayFlowCalendar calendar={calendar} />
      </div>

      {editing && <EditEventDialog event={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
