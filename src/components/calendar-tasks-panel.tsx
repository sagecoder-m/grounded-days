import { useMemo } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import { AddTaskDialog } from "./add-task-dialog";
import { TaskRow } from "./task-row";
import { actions, type Task } from "@/lib/store";

/** Local yyyy-mm-dd. Not toISOString(), which converts to UTC first and so
 *  reports the previous day for anyone west of Greenwich after 5pm. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The tasks half of the calendar page, sitting beside the grid.
 *
 * Tasks are deliberately not drawn on the calendar itself. A task has a done
 * state and often no time at all, and an event grid can express neither — the
 * old hand-rolled board put them in the day cells, where they read as events
 * you were not allowed to move. Beside the grid they keep their checkboxes and
 * their own shape, which is also the split the Overview page already uses.
 *
 * The list tracks the calendar's *visible range* rather than a clicked day.
 * DayFlow reports that range for every view, so month, week and agenda each
 * narrow the list without the two halves ever needing to be kept in sync by
 * hand — and nothing has to be clicked to make the panel relevant.
 */
export function CalendarTasksPanel({
  tasks,
  rangeStart,
  rangeEnd,
}: {
  tasks: Task[];
  /** Inclusive. Null until DayFlow has reported a range (first paint only). */
  rangeStart: Date | null;
  rangeEnd: Date | null;
}) {
  const groups = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    const from = dateKey(rangeStart);
    const to = dateKey(rangeEnd);

    // String comparison is safe and cheaper than parsing: yyyy-mm-dd sorts
    // lexicographically in the same order it sorts chronologically.
    const inRange = tasks.filter((t) => t.date && t.date >= from && t.date <= to);

    const byDate = new Map<string, Task[]>();
    for (const task of inRange) {
      const list = byDate.get(task.date!) ?? [];
      list.push(task);
      byDate.set(task.date!, list);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        // Unfinished work first within a day; done work stays but recedes.
        tasks: [...list.filter((t) => !t.done), ...list.filter((t) => t.done)],
      }));
  }, [tasks, rangeStart, rangeEnd]);

  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  // New tasks land on today when today is on screen, otherwise on the first day
  // of what is being looked at — never silently on a day out of view.
  const defaultDate =
    rangeStart && rangeEnd && isTodayInRange(rangeStart, rangeEnd)
      ? dateKey(new Date())
      : rangeStart
        ? dateKey(rangeStart)
        : undefined;

  return (
    <aside className="card-soft flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg leading-none">Tasks</h2>
          <p suppressHydrationWarning className="mt-1.5 text-xs text-ink-soft">
            {rangeLabel(rangeStart, rangeEnd)}
          </p>
        </div>
        <AddTaskDialog
          area="personal"
          defaultDate={defaultDate}
          trigger={
            <button
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-ink-soft transition-colors hover:bg-secondary"
              aria-label="Add a task"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        />
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-ink-soft">
          Nothing due in view. A clear stretch is allowed.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2">
              <p
                suppressHydrationWarning
                className="px-1 text-[11px] uppercase tracking-[0.08em] text-ink-soft"
              >
                {dayLabel(group.date)}
              </p>
              {group.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onDelete={() => actions.deleteTask(task.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function isTodayInRange(start: Date, end: Date) {
  const key = dateKey(new Date());
  return key >= dateKey(start) && key <= dateKey(end);
}

function dayLabel(date: string) {
  const parsed = parseISO(date);
  return isToday(parsed) ? "Today" : format(parsed, "EEE, MMM d");
}

function rangeLabel(start: Date | null, end: Date | null) {
  if (!start || !end) return " ";
  if (dateKey(start) === dateKey(end)) return format(start, "EEE, MMM d");
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${format(start, "MMM d")} – ${format(end, "d")}`
    : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}
