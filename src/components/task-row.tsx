import { Checkbox } from "@/components/ui/checkbox";
import { AreaChip } from "./area-chip";
import { actions, type Task } from "@/lib/store";
import { format, isBefore, isToday, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";

function niceDate(d?: string) {
  if (!d) return null;
  try {
    const date = parseISO(d);
    if (isToday(date)) return "today";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isBefore(date, today)) return `gently overdue · ${format(date, "MMM d")}`;
    return format(date, "EEE, MMM d");
  } catch {
    return d;
  }
}

interface Props {
  task: Task;
  showArea?: boolean;
  readOnly?: boolean;
  onDelete?: () => void;
}

export function TaskRow({ task, showArea = true, readOnly = false, onDelete }: Props) {
  const overdue =
    task.date &&
    !task.done &&
    isBefore(parseISO(task.date), new Date(new Date().setHours(0, 0, 0, 0)));
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-all",
        task.done && "opacity-60",
      )}
    >
      <Checkbox
        checked={task.done}
        onCheckedChange={() => actions.toggleTask(task.id)}
        className="mt-0.5 h-5 w-5 rounded-md border-tan data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />
      <div className="min-w-0 flex-1">
        {readOnly ? (
          <>
            <div
              className={cn(
                "text-sm font-medium leading-snug",
                task.done && "line-through decoration-1",
              )}
            >
              {task.title}
            </div>
            {task.description && (
              <div className="text-xs text-ink-soft mt-0.5">{task.description}</div>
            )}
          </>
        ) : (
          <>
            <InlineText
              value={task.title}
              onSave={(v) => v && actions.updateTask(task.id, { title: v })}
              showIcon
              className={cn(
                "text-sm font-medium leading-snug",
                task.done && "line-through decoration-1",
              )}
            />
            <InlineText
              value={task.description ?? ""}
              placeholder="Add a description…"
              multiline
              onSave={(v) => actions.updateTask(task.id, { description: v || undefined })}
              className="text-xs text-ink-soft"
            />
          </>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {showArea && <AreaChip area={task.area} />}
          {task.date && readOnly && (
            <span
              suppressHydrationWarning
              className={cn("text-[11px]", overdue ? "text-[color:var(--clay)]" : "text-ink-soft")}
            >
              {niceDate(task.date)}
            </span>
          )}
          {!readOnly && (
            <label className="relative inline-flex items-center">
              <span
                suppressHydrationWarning
                className={cn(
                  "cursor-pointer text-[11px] underline decoration-dotted underline-offset-4",
                  overdue ? "text-[color:var(--clay)]" : "text-ink-soft",
                )}
              >
                {task.date ? niceDate(task.date) : "add a date"}
              </span>
              <input
                type="date"
                value={task.date ?? ""}
                onChange={(e) => actions.updateTask(task.id, { date: e.target.value || undefined })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Task date"
              />
            </label>
          )}
        </div>
      </div>
      {!readOnly && onDelete && (
        <button
          onClick={onDelete}
          className="reveal-control text-ink-soft hover:text-[color:var(--clay)] p-1"
          aria-label="Delete task"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
