import { useMemo } from "react";
import { addDays, format, isToday, isTomorrow, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import { AddTaskDialog } from "./add-task-dialog";
import { AreaChip } from "./area-chip";
import { TaskRow } from "./task-row";
import { actions, type Task } from "@/lib/store";
import type { Area, CalEvent } from "@/lib/store-types";

/** Local yyyy-mm-dd. Not toISOString(), which converts to UTC first and so
 *  reports the previous day for anyone west of Greenwich after 5pm. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** dateKey for today, and for `days` after today. */
export function dayRange(days: number, startOffset = 0) {
  const base = new Date();
  return {
    from: dateKey(addDays(base, startOffset)),
    to: dateKey(addDays(base, startOffset + days - 1)),
  };
}

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

/**
 * A day-grouped list of tasks, and optionally the events sitting alongside them.
 *
 * Originally the panel beside the calendar grid; now the single way tasks are
 * shown anywhere, so "today" on the Overview and "the next three days" below it
 * are the same component with a different range rather than two lists that drift
 * apart. Tasks keep TaskRow, so checkboxes, inline title and description
 * editing, the date picker and delete behave identically everywhere.
 *
 * Events, when passed, render as rows without a checkbox. An appointment is not
 * something the app can complete, and a synced one is not even ours to change —
 * so they read as context for the day rather than as work to tick off.
 */
export function TaskGrid({
  tasks,
  events,
  from,
  to,
  addDate,
  emptyText = "Nothing due here. A clear stretch is allowed.",
  showAdd = false,
  includeOverdue = false,
  showGroupLabels = true,
  floating = false,
}: {
  tasks: Task[];
  /** Omit for a tasks-only grid. */
  events?: CalEvent[];
  /** Inclusive yyyy-mm-dd bounds. */
  from: string;
  to: string;
  /** Day a new task lands on. Defaults to the start of the range. */
  addDate?: string;
  emptyText?: string;
  /**
   * Whether to offer "+ Task".
   *
   * Defaults to off, and pages that want it say so. It used to default to on,
   * which put an add button on the Overview — a page that is meant to be a view
   * of what is already planned, where the only things you arrange are the
   * widgets themselves. Opt-in means a new widget cannot pick up a create
   * control just by rendering a grid.
   */
  showAdd?: boolean;
  /**
   * Lead with unfinished work whose due date has passed.
   *
   * Nothing surfaced past-due tasks anywhere, so something forgotten simply
   * disappeared — for a tool people are trusting with what they cannot hold in
   * their head, that is the worst failure available. It is deliberately not a
   * red badge or a count: the group is called "Still waiting", it sits in the
   * clay used for attention rather than the destructive red, and each row already
   * says "gently overdue" rather than shouting a number of days.
   */
  includeOverdue?: boolean;
  /**
   * Day headings and the "Still waiting" heading.
   *
   * Off where the surrounding section already names the day — "A look at today"
   * followed by a row reading TODAY is the same word twice. The overdue rows keep
   * their own "gently overdue · Aug 5" line, so dropping the heading loses the
   * label and not the information.
   */
  showGroupLabels?: boolean;
  /** Lift every row off the surface. See TaskRow — the Overview's treatment. */
  floating?: boolean;
}) {
  const overdue = useMemo(() => {
    if (!includeOverdue) return [];
    return tasks
      .filter((t) => !t.done && t.date && t.date < from)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [tasks, from, includeOverdue]);

  const groups = useMemo(() => {
    // String comparison is safe and cheaper than parsing: yyyy-mm-dd sorts
    // lexicographically in the same order it sorts chronologically.
    const inRange = <T extends { date?: string }>(items: T[]) =>
      items.filter((i) => i.date && i.date >= from && i.date <= to);

    const byDate = new Map<string, { tasks: Task[]; events: CalEvent[] }>();
    const bucket = (date: string) => {
      const existing = byDate.get(date);
      if (existing) return existing;
      const fresh = { tasks: [] as Task[], events: [] as CalEvent[] };
      byDate.set(date, fresh);
      return fresh;
    };

    for (const task of inRange(tasks)) bucket(task.date!).tasks.push(task);
    for (const event of inRange(events ?? [])) bucket(event.date).events.push(event);

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, group]) => ({
        date,
        // Timed events first, in clock order, then all-day ones — the order the
        // day actually happens in.
        events: group.events.sort(
          (a, b) =>
            Number(!!b.startsAt) - Number(!!a.startsAt) ||
            (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
        ),
        // Unfinished work first; done work stays visible but recedes, because
        // seeing what you already did is half the point of looking at a day.
        tasks: [...group.tasks.filter((t) => !t.done), ...group.tasks.filter((t) => t.done)],
      }));
  }, [tasks, events, from, to]);

  const total = groups.reduce((n, g) => n + g.tasks.length + g.events.length, 0) + overdue.length;

  return (
    <div className="space-y-4">
      {showAdd && (
        <div className="flex justify-end">
          <AddTaskDialog
            area="personal"
            defaultDate={addDate ?? from}
            trigger={
              <button
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-ink-soft transition-colors hover:bg-secondary"
                aria-label="Add a task"
              >
                <Plus className="h-3.5 w-3.5" /> Task
              </button>
            }
          />
        </div>
      )}

      {overdue.length > 0 && (
        <div className="space-y-2">
          {showGroupLabels && (
            <p className="px-1 text-[11px] uppercase tracking-[0.08em] text-[color:var(--clay)]">
              Still waiting
            </p>
          )}
          {overdue.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              floating={floating}
              onDelete={() => actions.deleteTask(task.id)}
            />
          ))}
        </div>
      )}

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-soft">
          {emptyText}
        </p>
      ) : (
        /*
          Days flow into columns once there is room for them.

          Keyed to the container, not the window, so this answers the width the
          grid has actually been given — which on the Overview is whatever size
          the person chose for that widget. A full-width Upcoming used to be one
          narrow column of cards down the middle of a very wide card, with the
          days you most need to see pushed furthest down the page. items-start so
          a heavy Thursday does not stretch a light Friday to match it.
        */
        <div className="grid items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2">
              {showGroupLabels && (
                <p
                  suppressHydrationWarning
                  className="px-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft"
                >
                  {dayLabel(group.date)}
                </p>
              )}

              {group.events.map((event) => (
                <EventRow key={event.id} event={event} floating={floating} />
              ))}

              {group.tasks.map((task) => (
                <TaskRow
              key={task.id}
              task={task}
              floating={floating}
              onDelete={() => actions.deleteTask(task.id)}
            />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Synced events get a dashed edge: the database rejects client writes to them,
 *  so looking un-editable is the honest rendering. */
function EventRow({ event, floating = false }: { event: CalEvent; floating?: boolean }) {
  const synced = event.source && event.source !== "local";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        synced ? "border-dashed border-tan bg-secondary/60" : "border-border bg-card"
      } ${floating ? "float-row" : ""}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: event.area ? AREA_VAR[event.area] : "var(--tan)" }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{event.title}</div>
        <div className="text-[11px] text-ink-soft">
          {!event.allDay && event.startsAt ? format(new Date(event.startsAt), "h:mm a") : "all day"}
          {event.source === "google" && " · Google"}
          {event.source === "microsoft" && " · Outlook"}
        </div>
      </div>
      {event.area && <AreaChip area={event.area} />}
    </div>
  );
}

function dayLabel(date: string) {
  const parsed = parseISO(date);
  if (isToday(parsed)) return "Today";
  if (isTomorrow(parsed)) return "Tomorrow";
  return format(parsed, "EEE, MMM d");
}
