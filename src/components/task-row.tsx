import { Checkbox } from "@/components/ui/checkbox";
import { AreaChip } from "./area-chip";
import { actions, type Task } from "@/lib/store";
import { addDays, format, isBefore, isToday, parseISO } from "date-fns";
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

  /**
   * One tap to say "not today".
   *
   * Moving a task off today already worked — through the date field, which means
   * opening a picker and choosing a day. That is a fine way to reschedule
   * something and a terrible way to admit today is not happening, and the
   * difference matters: when the only cheap action on a row is "done", a row you
   * cannot do stays there looking at you. Tapping through into a calendar to
   * defer feels like paperwork for a failure, so people leave it instead, and
   * the list fills with things they have privately already given up on.
   *
   * Offered only on work that is due today or already late, since those are the
   * rows that carry that weight — a task dated next week is not asking anything
   * of anyone yet. Shown rather than revealed on hover: an escape hatch nobody
   * discovers is not an escape hatch, and it is one line of small grey text.
   */
  const canDefer =
    !readOnly && !task.done && !!task.date && (overdue || isToday(parseISO(task.date)));
  const notToday = () =>
    actions.updateTask(task.id, { date: format(addDays(new Date(), 1), "yyyy-MM-dd") });
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
                {task.date ? niceDate(task.date) : "add a due date"}
              </span>
              <input
                type="date"
                value={task.date ?? ""}
                onChange={(e) => actions.updateTask(task.id, { date: e.target.value || undefined })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Due date"
              />
            </label>
          )}
          {canDefer && (
            <button
              type="button"
              onClick={notToday}
              className="text-[11px] text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
            >
              not today
            </button>
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
