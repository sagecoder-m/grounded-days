import { Check, Trash2 } from "lucide-react";
import { format, isBefore, parseISO } from "date-fns";

import { actions, AREA_META, type Task } from "@/lib/store";

/**
 * Today's tasks as squares rather than full-width rows.
 *
 * A stack of long rectangles reads as a list to get through; a small grid of
 * tiles reads as a handful of things, and the eye takes in the whole set at
 * once instead of scanning line by line. The whole tile is the checkbox, which
 * also makes the target far bigger than a 20px box on a phone.
 */
export function TodayTiles({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="card-soft p-6 text-center italic text-ink-soft">
        Nothing pressing. Enjoy some space.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tasks.map((task) => (
        <TaskTile key={task.id} task={task} />
      ))}
    </div>
  );
}

function TaskTile({ task }: { task: Task }) {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const overdue = task.date && !task.done && isBefore(parseISO(task.date), startOfToday);
  const meta = AREA_META[task.area];

  return (
    <div className="group relative">
      <button
        onClick={() => actions.toggleTask(task.id)}
        aria-pressed={task.done}
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        className={`flex aspect-square w-full flex-col justify-between rounded-2xl border p-3 text-left transition-all ${
          task.done
            ? "border-border bg-secondary/50 opacity-70"
            : "border-border bg-card hover:border-primary"
        }`}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: `var(--${meta.color})` }}
            title={meta.label}
          />
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all ${
              task.done ? "border-primary" : "border-border"
            }`}
            style={
              task.done
                ? { background: "linear-gradient(135deg, var(--sage-deep), var(--sage))" }
                : undefined
            }
          >
            {task.done && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
          </span>
        </div>

        {/* Long titles clamp rather than stretch the tile out of square. */}
        <span
          className={`line-clamp-3 text-sm leading-snug ${
            task.done ? "text-ink-soft line-through" : ""
          }`}
        >
          {task.title}
        </span>

        <span className="text-[10px] text-ink-soft">
          {overdue && task.date
            ? `gently overdue · ${format(parseISO(task.date), "MMM d")}`
            : meta.label}
        </span>
      </button>

      <button
        onClick={() => actions.deleteTask(task.id)}
        aria-label={`Delete "${task.title}"`}
        className="absolute right-1.5 bottom-1.5 rounded-lg p-1.5 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:text-[color:var(--clay)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
