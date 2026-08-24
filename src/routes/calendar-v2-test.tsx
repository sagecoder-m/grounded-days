/**
 * Isolated proof-of-concept for the DayFlow swap. Not linked from navigation.
 *
 * Purpose: answer two open questions with evidence before touching the real
 * /calendar route —
 *   1. Does DayFlow's own compiled Tailwind CSS visually collide with this
 *      app's Tailwind build anywhere on the page?
 *   2. Does the adapter produce events DayFlow actually renders, with area
 *      colours and a read-only synced calendar behaving as designed?
 *
 * Delete this file once the real swap lands — it exists only to de-risk it.
 */
// DayFlow's stylesheet is imported once from src/styles.css, into a cascade
// layer — see the comment there. Importing "@dayflow/core/dist/styles.css"
// from a route instead lets its unlayered Preflight outrank the app's own
// utilities and flatten every styled button on the page.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { createDragPlugin } from "@dayflow/plugin-drag";
import { DayFlowCalendar, createMonthView, createWeekView, createAgendaView, useCalendarApp } from "@dayflow/react";
import { ViewType, type Event as DayFlowEvent } from "@dayflow/core";

import { useQuery } from "@tanstack/react-query";

import { useAppState } from "@/lib/store";
import type { CalEvent, CalendarConnection } from "@/lib/store-types";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { useSession } from "@/lib/use-session";
import { actions } from "@/lib/db/mutations";
import { buildCalendarTypes, fromDayFlowEvent, toDayFlowEvent } from "@/lib/dayflow-adapter";
import { useDayFlowEventSync } from "@/lib/use-dayflow-sync";
import { CalendarTasksPanel, dateKey } from "@/components/calendar-tasks-panel";

export const Route = createFileRoute("/calendar-v2-test")({
  component: TestPage,
});

function TestPage() {
  const state = useAppState();
  const { user } = useSession();
  const connections = useQuery({ ...calendarConnectionsQuery(user?.id ?? ""), enabled: Boolean(user) });

  /**
   * TEST-ONLY fixtures. The demo account has no calendar connection, so without
   * these the read-only path — the whole reason DayFlow was chosen over ilamy —
   * is never exercised and "synced events can't be dragged" stays an untested
   * claim. A fake connection plus one event attributed to it makes the lockdown
   * observable in the running app. Both die with this route.
   */
  const testConnections = useMemo(
    () => [
      ...(connections.data ?? []),
      {
        id: "test-google",
        provider: "google",
        accountEmail: "fixture@example.com",
        status: "connected",
      } as CalendarConnection,
    ],
    [connections.data],
  );

  const calendars = useMemo(() => buildCalendarTypes(testConnections), [testConnections]);

  const events = useMemo(() => {
    const real = state.events.map(toDayFlowEvent);
    const today = state.events[0]?.date ?? "2026-08-24";
    const syncedFixture = toDayFlowEvent({
      id: "fixture-synced-event",
      title: "Synced — should not drag",
      date: today,
      startsAt: `${today}T16:00:00.000Z`,
      endsAt: `${today}T17:00:00.000Z`,
      allDay: false,
      source: "google",
    } as CalEvent);
    return [...real, syncedFixture];
  }, [state.events]);

  const views = useMemo(
    () => [createMonthView({ showEventDots: true }), createWeekView({}), createAgendaView({})],
    [],
  );
  /**
   * A drag is only ever a change of when, never of what, so both handlers use
   * the same writer. It writes through the same actions.updateEvent the old
   * board used, so the optimistic cache update and the Supabase write stay
   * exactly as they were — this swap changes the calendar, not the data path.
   *
   * The synced-event guard is belt-and-braces. DayFlow already refuses to drag
   * an event whose calendar is readOnly, and RLS would reject the write anyway,
   * but a silent no-op beats an optimistic cache update that gets reverted on a
   * failed round trip.
   */
  const persistMove = useCallback((updated: DayFlowEvent) => {
    const source = (updated.meta as { source?: string } | undefined)?.source;
    const patch = fromDayFlowEvent(updated);

    // TEST-ONLY: records every callback the drag plugin fires, so a drag that
    // does not persist can be diagnosed as "gesture never reached the plugin"
    // rather than "the write failed". Dies with this route.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __dfPersistLog?: unknown[] };
      w.__dfPersistLog = w.__dfPersistLog ?? [];
      w.__dfPersistLog.push({ id: updated.id, title: updated.title, source, patch });
    }

    if (source !== "local") return;
    actions.updateEvent(updated.id, patch);
  }, []);

  const plugins = useMemo(
    () => [createDragPlugin({ onEventDrop: persistMove, onEventResize: persistMove })],
    [persistMove],
  );

  /**
   * The range the calendar is currently showing, which the tasks panel follows.
   *
   * Held as a yyyy-mm-dd pair rather than two Dates because DayFlow re-reports
   * the range on things that are not a real change of range (a re-render, a
   * mutation), and two fresh Date objects are never ===, so storing Dates would
   * set state on every report and spin. Comparing the string keys makes the
   * update idempotent.
   */
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  const onVisibleRangeChange = useCallback((start: Date, end: Date) => {
    setRange((prev) =>
      prev && dateKey(prev.start) === dateKey(start) && dateKey(prev.end) === dateKey(end)
        ? prev
        : { start, end },
    );
  }, []);

  const calendar = useCalendarApp({
    views,
    events,
    calendars,
    defaultCalendar: "personal",
    defaultView: ViewType.MONTH,
    plugins,
    callbacks: { onVisibleRangeChange },
    // The rest of the app writes times as "4:00am"; DayFlow defaults to 24h,
    // which made the same event read two different ways on two pages.
    timeFormat: "12h",
  });

  // The events above are only the first-render snapshot as far as DayFlow is
  // concerned; this is what actually keeps it in step with the query.
  useDayFlowEventSync(calendar, events);

  // TEST-ONLY: lets the lockdown be asserted against DayFlow's own resolver
  // rather than by eyeballing whether a drag happened. Dies with this route.
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__dfCalendar = calendar;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="rounded-2xl border border-dashed border-[color:var(--clay)] bg-[color:var(--clay-soft)] p-3 text-sm">
        Test route — not linked anywhere. Checking for CSS collisions and
        adapter correctness before the real swap.
      </div>

      {/* A plain app component right next to DayFlow, on the same page, using
          only this app's own Tailwind classes — the control for spotting a
          collision. If its border radius, spacing or colour looks different
          from how it renders on every other page, DayFlow's CSS is bleeding
          into it. */}
      <div className="card-soft space-y-2 p-4">
        <p className="text-sm text-ink-soft">
          Control element: a `card-soft` box with a rounded-2xl button, styled
          only by this app&apos;s own Tailwind build.
        </p>
        <button className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          Should look identical to every other primary button in the app
        </button>
      </div>

      {/* Calendar and tasks side by side on wide screens, stacked on narrow —
          a task list squeezed into a column next to a month grid on a phone
          would leave neither enough room. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0" style={{ height: 700 }}>
          <DayFlowCalendar calendar={calendar} />
        </div>
        <CalendarTasksPanel
          tasks={state.tasks}
          rangeStart={range?.start ?? null}
          rangeEnd={range?.end ?? null}
        />
      </div>
    </div>
  );
}
