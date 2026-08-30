import { Link } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { CalendarDays } from "lucide-react";

import { actions, useAppState } from "@/lib/store";
import { dateKey } from "@/components/task-grid";
import { conflictingEventIds } from "@/lib/schedule";
import { useMounted } from "@/lib/use-mounted";
import { Checkbox } from "@/components/ui/checkbox";
import { FitRows } from "@/components/dashboard/fit-rows";
import type { Area, Task } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/**
 * Today, as an agenda.
 *
 * It was two columns — an event timeline beside a grid of task cards — and the
 * halves did not read as one day. The calendar's own Agenda view already answers
 * "what does a day look like?" in a single column: a date rail, then rows in the
 * order they happen. This mirrors that structure, so the two match by following
 * the same shape rather than by resembling each other by accident.
 *
 * Not DayFlow's actual agenda view, though. Mounting a calendar app here to draw
 * one day would pull the whole engine onto a page that otherwise never loads it,
 * for a list this component renders in fifty lines.
 *
 * Tasks share the list with events, after them, because a task has a date but no
 * time. They keep their checkboxes: an event happens to you, a task is something
 * you do.
 */
export function TodayGlance() {
  const state = useAppState();
  const mounted = useMounted();

  // Everything here keys off today's date, so hold a placeholder until the
  // client has mounted rather than risk a server/client mismatch.
  if (!mounted) {
    // No card on the placeholder either, or the widget flashes a panel that
    // then vanishes when the real thing arrives.
    return <div className="h-44 animate-pulse rounded-2xl bg-secondary/50" />;
  }

  const today = new Date();
  const iso = dateKey(today);

  const events = state.events.filter((e) => e.date === iso);
  const timed = events
    .filter((e) => !e.allDay && e.startsAt)
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const allDay = events.filter((e) => e.allDay || !e.startsAt);
  const conflicts = conflictingEventIds(events);

  // Today's work, plus anything still outstanding from before it. Those rows
  // carry their own date, so they need no separate heading.
  const todays = state.tasks.filter((t) => t.date === iso);
  const overdue = state.tasks.filter((t) => !t.done && t.date && t.date < iso);
  const tasks = [...overdue, ...todays.filter((t) => !t.done), ...todays.filter((t) => t.done)];

  const remaining = tasks.filter((t) => !t.done).length;
  const nothing = events.length === 0 && tasks.length === 0;

  return (
    /*
      No card around any of this.

      It had one, to make the widget match its neighbours, and that turned out to
      be the wrong kind of matching: a panel with rows inside it reads as a
      container of things, and the rows stop being things. Upcoming never had the
      panel and always read better for it — a day is a few objects lying on the
      page, not a filing cabinet. So the rail is a heading, the rows are the
      cards, and the surface behind them is the page.
    */
    <div className="flex h-full min-h-0 flex-col">
      {/* The date rail: a serif numeral with the month and weekday beside it,
          and the day's shape on the right. */}
      <div className="flex items-center justify-between gap-4 px-1 pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-4xl leading-none tracking-tight">
            {format(today, "d")}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm">{format(today, "MMM yyyy")}</span>
            <span className="text-sm text-ink-soft">{format(today, "EEEE")}</span>
          </span>
        </div>
        <span className="text-xs text-ink-soft">
          {nothing
            ? "nothing scheduled"
            : [
                events.length > 0 && `${events.length} ${events.length === 1 ? "event" : "events"}`,
                tasks.length > 0 && `${remaining} to do`,
              ]
                .filter(Boolean)
                .join(" \u00b7 ")}
        </span>
      </div>

      {nothing ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
          A clear day. That counts as a good one.
        </p>
      ) : (
        /* Spaced rather than divided. Hairlines make a list read as one block,
           and a block is the thing that overwhelms — see .float-row.

           FitRows shows as many of these as the tile is tall enough for and
           says how many it left out, so a full day never runs off the bottom
           of a box someone deliberately made short. */
        <FitRows
          className="space-y-2"
          renderMore={(hidden) => (
            <Link
              to="/calendar"
              className="mt-2 block px-1 text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
            >
              {hidden > 0 ? `+${hidden} more · see the whole calendar` : "See the whole calendar"}
            </Link>
          )}
        >
          {[
            ...timed.map((event) => (
              <AgendaRow
                key={event.id}
                time={format(new Date(event.startsAt!), "h:mm a")}
                dot={event.area ? AREA_VAR[event.area] : "var(--tan)"}
                title={event.title}
                note={conflicts.has(event.id) ? "overlaps" : undefined}
                synced={event.source !== "local"}
              />
            )),
            ...allDay.map((event) => (
              <AgendaRow
                key={event.id}
                time="all day"
                dot={event.area ? AREA_VAR[event.area] : "var(--tan)"}
                title={event.title}
                synced={event.source !== "local"}
              />
            )),
            ...tasks.map((task) => <TaskAgendaRow key={task.id} task={task} today={iso} />),
          ]}
        </FitRows>
      )}
    </div>
  );
}

/**
 * One scheduled thing.
 *
 * Deliberately not the same object as a task. An event happens to you at a time
 * you do not choose; a task is something you decide to do. They were separated
 * only by a checkbox against a dot, which is a difference you have to look for —
 * and mistaking a fixed appointment for something you could move is how a day
 * gets planned wrong.
 *
 * So the surface differs too: an event sits on the recessed tone with no
 * checkbox and a calendar mark, and reads as part of the day's shape rather than
 * as a line waiting to be ticked. Nothing here is tickable, which is the honest
 * rendering — the app cannot complete your dentist appointment.
 *
 * The time sits in a fixed-width column so times line up down the list instead
 * of drifting with each title's length.
 */
function AgendaRow({
  time,
  dot,
  title,
  note,
  synced,
}: {
  time: string;
  dot: string;
  title: string;
  note?: string;
  synced?: boolean;
}) {
  return (
    <div
      // Marks this as one measurable row for FitRows.
      data-fit-row
      /* No float-row: an event is not interactive here — nothing to tick, edit
         or open — and a row that lifts under the pointer promises something to
         press. Tasks lift because they answer; events sit still because they
         do not. The distinction earns its keep twice. */
      className={`flex items-baseline gap-3 rounded-2xl border bg-secondary px-4 py-2.5 ${
        // A synced event is not even ours to edit — the database rejects client
        // writes to it — so the dashed edge is the honest rendering.
        synced ? "border-dashed border-tan" : "border-border"
      }`}
    >
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-soft">{time}</span>
      <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: dot }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        {title}
        {note && <span className="ml-1.5 text-[11px] text-[color:var(--clay)]">{note}</span>}
        {synced && <span className="ml-1.5 text-[11px] text-ink-soft">synced</span>}
      </span>
    </div>
  );
}

/** A task in the agenda. There is no time to show, so the left column carries
 *  whether it is due today or has been waiting — the useful thing about a task. */
function TaskAgendaRow({ task, today }: { task: Task; today: string }) {
  const late = Boolean(task.date && task.date < today);
  return (
    <div
      data-fit-row
      className="group float-row flex items-baseline gap-3 rounded-2xl border border-border bg-card px-4 py-2.5"
    >
      <span
        className={`w-14 shrink-0 text-right text-xs ${
          late ? "text-[color:var(--clay)]" : "text-ink-soft"
        }`}
      >
        {late ? format(new Date(`${task.date}T12:00:00`), "MMM d") : "to do"}
      </span>
      <Checkbox
        checked={task.done}
        onCheckedChange={() => actions.toggleTask(task.id)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-tan data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          task.done ? "text-ink-soft line-through decoration-1" : ""
        }`}
      >
        {task.title}
      </span>
      {/* Everything in this list is due today or already late, so every open row
          can be let go of. Kept to hover here rather than shown outright — the
          rows are one line each and a permanent second control on all of them
          would crowd the one widget people look at every morning. The full-size
          version on the area pages is always visible. */}
      {!task.done && (
        <button
          type="button"
          onClick={() =>
            actions.updateTask(task.id, { date: format(addDays(new Date(), 1), "yyyy-MM-dd") })
          }
          className="reveal-control shrink-0 text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          not today
        </button>
      )}
      <span
        className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: AREA_VAR[task.area] }}
        title={task.area}
      />
    </div>
  );
}
