import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { actions, useAppState } from "@/lib/store";
import { dateKey } from "@/components/task-grid";
import { conflictingEventIds } from "@/lib/schedule";
import { useMounted } from "@/lib/use-mounted";
import { Checkbox } from "@/components/ui/checkbox";
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
    return <div className="card-soft h-44 animate-pulse rounded-2xl bg-secondary/60" />;
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
    <div className="card-soft overflow-hidden">
      {/* The date rail, matching the calendar agenda's: a serif numeral with the
          month and weekday beside it, and the day's shape on the right. */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
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

      <div className="divide-y divide-border">
        {nothing && (
          <p className="px-5 py-8 text-center text-sm italic text-ink-soft">
            A clear day. That counts as a good one.
          </p>
        )}

        {timed.map((event) => (
          <AgendaRow
            key={event.id}
            time={format(new Date(event.startsAt!), "h:mm a")}
            dot={event.area ? AREA_VAR[event.area] : "var(--tan)"}
            title={event.title}
            note={conflicts.has(event.id) ? "overlaps" : undefined}
            synced={event.source !== "local"}
          />
        ))}

        {allDay.map((event) => (
          <AgendaRow
            key={event.id}
            time="all day"
            dot={event.area ? AREA_VAR[event.area] : "var(--tan)"}
            title={event.title}
            synced={event.source !== "local"}
          />
        ))}

        {tasks.map((task) => (
          <TaskAgendaRow key={task.id} task={task} today={iso} />
        ))}
      </div>

      <Link
        to="/calendar"
        className="block border-t border-border px-5 py-3 text-center text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        See the whole calendar
      </Link>
    </div>
  );
}

/** One scheduled thing. The time sits in a fixed-width column so times line up
 *  down the list instead of drifting with each title's length. */
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
    <div className="flex items-baseline gap-3 px-5 py-2.5">
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-soft">{time}</span>
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
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
    <div className="flex items-baseline gap-3 px-5 py-2.5">
      <span
        className={`w-16 shrink-0 text-right text-xs ${
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
      <span
        className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: AREA_VAR[task.area] }}
        title={task.area}
      />
    </div>
  );
}
