import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { DateField } from "@/components/ui/date-field";
import { TimeField, formatTime } from "@/components/ui/time-field";
import { AreaChip } from "./area-chip";
import { actions, type Task } from "@/lib/store";
import { addDays, format, isBefore, isToday, parseISO } from "date-fns";

import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";
import { ConfirmDeleteButton } from "./confirm-delete";

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
  /** Lift the row off its surface. Opt-in rather than the default: it is the
   *  Overview's treatment, where the lists are short and each row is meant to
   *  read as one liftable thing. An area page is a working list of forty. */
  floating?: boolean;
}

export function TaskRow({
  task,
  showArea = true,
  readOnly = false,
  onDelete,
  floating = false,
}: Props) {
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

  /*
    Whether this row's description is open.

    Collapsed to a single line by default, because a description is not always
    the thing you are looking at. An assignment pulled in from a syllabus can
    carry a paragraph, and a course full of those turns a list you are scanning
    into a page you have to read — the titles stop being findable, which is the
    one job the list has.

    Per row and not persisted: this is a peek at one thing, not a preference
    about all of them, and a toggle that outlives the glance would need
    somewhere to live and a reason to be there.
  */
  const [showDescription, setShowDescription] = useState(false);
  const hasDescription = Boolean(task.description?.trim());

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-all",
        floating && "float-row",
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
              <div
                className={cn("mt-0.5 text-xs text-ink-soft", !showDescription && "line-clamp-1")}
              >
                {task.description}
              </div>
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
            {/*
              Collapsed is a plain line, not a clamped editor.

              InlineText puts its className on a textarea while editing and on
              an inline-flex button otherwise, so a line-clamp passed down would
              either cut the box being typed into or override the button's own
              display and drop the pencil out of line. A separate one-line
              preview avoids both, and clicking it opens the same editor the
              toggle does.

              With no description at all the editor shows directly, so "Add a
              description…" stays exactly where it has always been — nothing new
              to find in order to write one.
            */}
            {hasDescription && !showDescription ? (
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                title="Show the full description"
                className="-mx-2 block w-full truncate rounded-xl px-2 py-1 text-left text-xs text-ink-soft transition-colors hover:bg-secondary/70"
              >
                {task.description}
              </button>
            ) : (
              <InlineText
                value={task.description ?? ""}
                placeholder="Add a description…"
                multiline
                onSave={(v) => actions.updateTask(task.id, { description: v || undefined })}
                className="text-xs text-ink-soft"
              />
            )}
          </>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {/* Only when there is something behind it. A control that reveals
              nothing is worse than no control. */}
          {hasDescription && (
            <button
              type="button"
              onClick={() => setShowDescription((open) => !open)}
              aria-expanded={showDescription}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-soft transition-colors hover:text-ink"
            >
              {showDescription ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showDescription ? "Hide details" : "Details"}
            </button>
          )}
          {showArea && <AreaChip area={task.area} />}
          {task.date && readOnly && (
            <span
              suppressHydrationWarning
              className={cn("text-[11px]", overdue ? "text-[color:var(--clay)]" : "text-ink-soft")}
            >
              {niceDate(task.date)}
              {/* The clock time, when there is one. Coursework is due at
                  11:59pm far more often than it is due "that day", and which
                  of the two it is decides whether something is late. */}
              {formatTime(task.dueTime) && (
                <span className="ml-1 tabular-nums">{formatTime(task.dueTime)}</span>
              )}
            </span>
          )}
          {!readOnly && (
            <DateField
              value={task.date ?? ""}
              onChange={(v) => actions.updateTask(task.id, { date: v || undefined })}
              label={task.date ? (niceDate(task.date) ?? undefined) : "add a due date"}
              icon={false}
              clearable
              aria-label="Due date"
              className={cn(
                "h-auto w-auto gap-0 border-0 bg-transparent p-0 text-[11px] underline decoration-dotted underline-offset-4 hover:bg-transparent focus:border-0",
                overdue ? "text-[color:var(--clay)]" : "text-ink-soft",
              )}
            />
          )}
          {/* Offered only once a date exists: a time with no day is not a
              deadline, and the database refuses the pair outright. */}
          {!readOnly && task.date && (
            <TimeField
              value={task.dueTime ?? ""}
              onChange={(v) => actions.updateTask(task.id, { dueTime: v || undefined })}
              aria-label="Due time"
            />
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
        <ConfirmDeleteButton
          itemLabel={task.title}
          onConfirm={onDelete}
          className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
          iconClassName="h-4 w-4"
          aria-label="Delete task"
        />
      )}
    </div>
  );
}
