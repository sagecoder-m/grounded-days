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
// DayFlow's stylesheet is imported from src/styles.css instead of here, inside
// a `dayflow` cascade layer — see the comment there. Importing it directly from
// a route let its unlayered Preflight reset outrank the app's own utilities.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { createDragPlugin } from "@dayflow/plugin-drag";
import { DayFlowCalendar, createMonthView, createWeekView, createAgendaView, useCalendarApp } from "@dayflow/react";
import { ViewType } from "@dayflow/core";

import { useQuery } from "@tanstack/react-query";

import { useAppState } from "@/lib/store";
import { calendarConnectionsQuery } from "@/lib/db/queries";
import { useSession } from "@/lib/use-session";
import { buildCalendarTypes, toDayFlowEvent } from "@/lib/dayflow-adapter";

export const Route = createFileRoute("/calendar-v2-test")({
  component: TestPage,
});

function TestPage() {
  const state = useAppState();
  const { user } = useSession();
  const connections = useQuery({ ...calendarConnectionsQuery(user?.id ?? ""), enabled: Boolean(user) });

  const calendars = useMemo(
    () => buildCalendarTypes(connections.data ?? []),
    [connections.data],
  );
  const events = useMemo(() => state.events.map(toDayFlowEvent), [state.events]);

  const views = useMemo(
    () => [createMonthView({ showEventDots: true }), createWeekView({}), createAgendaView({})],
    [],
  );
  const plugins = useMemo(() => [createDragPlugin({})], []);

  const calendar = useCalendarApp({
    views,
    events,
    calendars,
    defaultCalendar: "personal",
    defaultView: ViewType.MONTH,
    plugins,
  });

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

      <div style={{ height: 700 }}>
        <DayFlowCalendar calendar={calendar} />
      </div>
    </div>
  );
}
