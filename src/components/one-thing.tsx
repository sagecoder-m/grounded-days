import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";

import { actions, AREA_META, todayISO } from "@/lib/store";
import type { AppState, Task } from "@/lib/store-types";
import { Button } from "@/components/ui/button";

/**
 * One thing, and nothing else on the screen.
 *
 * The app has said "one small thing at a time" in its greeting since the
 * beginning and then shown a board of everything, which is a promise the
 * interface does not keep. For a brain that stalls at the point of choosing,
 * a list of nine things is not nine options, it is a wall — and the answer is
 * not a better list, it is no list.
 *
 * So this is deliberately bare: one title, one area, and three ways out. No
 * count of what remains, no progress through a queue, no "3 of 12" — knowing how
 * much is left is exactly the thing that makes starting hard, and it is the
 * reason a normal to-do list fails the people this is for.
 *
 * The three actions are the three honest answers to "will you do this now":
 *
 *   Done            it is finished
 *   Not today       it is real, but not now — the date moves to tomorrow
 *   Something else  this one is not it — show a different one, nothing changes
 *
 * "Something else" changing nothing matters. If skipping cost something, the
 * only safe move would be to close the whole thing, which is how people end up
 * avoiding the app rather than the task.
 */

/**
 * Which one to offer.
 *
 * Today's work first, oldest first within that, then anything else that is
 * dated, then the undated. Oldest-first rather than newest, because the thing
 * that has been sitting longest is usually the one costing the most to carry.
 *
 * Deliberately not random and not "most important" — there is no priority field
 * in this app, and inventing one here would be inventing a judgement.
 */
export function pickOneThing(state: AppState, skipped: string[] = []): Task | null {
  const today = todayISO();
  const open = state.tasks.filter((t) => !t.done && !skipped.includes(t.id));
  if (open.length === 0) return null;

  const rank = (t: Task) => {
    if (t.date && t.date <= today) return 0; // due or overdue
    if (t.date) return 1; // ahead of today
    return 2; // undated
  };
  return (
    [...open].sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return (a.date ?? "9999").localeCompare(b.date ?? "9999");
    })[0] ?? null
  );
}

export function OneThing({ state, onClose }: { state: AppState; onClose: () => void }) {
  /** Passed over this sitting. Not persisted: skipping is a mood, not a decision
   *  about the task, and it should not follow someone into tomorrow. */
  const [skipped, setSkipped] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const task = useMemo(() => pickOneThing(state, skipped), [state, skipped]);

  /** The write throws synchronously with no signed-in context, which would abort
   *  the handler and leave the button looking simply broken. Say so instead. */
  function apply(patch: Partial<Task>) {
    if (!task) return;
    try {
      actions.updateTask(task.id, patch);
    } catch {
      setFailed(true);
    }
  }

  const done = () => apply({ done: true });
  const notToday = () => apply({ date: format(addDays(new Date(), 1), "yyyy-MM-dd") });

  /**
   * Escape leaves, and the screen takes focus when it opens.
   *
   * This covers the page rather than replacing it, so without moving focus the
   * next Tab would land somewhere in the nav behind — invisible controls, on a
   * screen whose entire point is that there is nothing else to attend to.
   */
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    shell.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={shell}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="One thing at a time"
      className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
    >
      {/* The way out, top right and always there. Being unable to find the exit
          is its own kind of trapped. */}
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pb-16">
        {failed ? (
          <div className="my-auto w-full max-w-md text-center">
            <p className="text-sm leading-relaxed text-ink">
              That didn&rsquo;t go through &mdash; nothing was changed. Worth a refresh, then try
              again.
            </p>
            <Button onClick={onClose} variant="outline" className="mt-8 rounded-full border-tan">
              Back
            </Button>
          </div>
        ) : task ? (
          /* Two halves that meet in the middle of the screen: the words sit at
             the bottom of the upper half, the buttons at the top of the lower
             one. So the buttons land in the same place for every task, however
             long its title runs. "Something else" is pressed repeatedly by
             design, and a control that shifts under the finger between presses
             is the sort of small friction this whole screen exists to remove. */
          <>
            <div className="flex w-full max-w-md flex-1 flex-col justify-end pb-10 text-center">
              {/* Small, above: whose corner of life this belongs to, without a
                  chip's worth of visual weight competing with the sentence. */}
              <p className="text-xs uppercase tracking-[0.12em] text-ink-soft">
                {AREA_META[task.area].label}
                {task.date && task.date < todayISO()
                  ? ` · has been waiting since ${format(parseISO(task.date), "d MMM")}`
                  : ""}
              </p>

              <h1 className="mt-4 font-serif text-2xl leading-snug md:text-3xl">{task.title}</h1>

              {task.description && (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{task.description}</p>
              )}
            </div>

            <div className="flex w-full max-w-xs flex-1 flex-col items-center gap-3">
              <Button onClick={done} className="w-full rounded-full">
                <Check className="h-4 w-4" /> Done
              </Button>
              <Button
                onClick={notToday}
                variant="outline"
                className="w-full rounded-full border-tan"
              >
                Not today
              </Button>
              <button
                type="button"
                onClick={() => setSkipped((s) => (task ? [...s, task.id] : s))}
                className="text-sm text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
              >
                Something else
              </button>
            </div>
          </>
        ) : (
          /* Reached either by finishing everything or by passing on all of it.
             Both are fine, and the wording has to work for both — "all done"
             would be wrong for someone who simply said no to each one. */
          <div className="my-auto w-full max-w-md text-center">
            <h1 className="font-serif text-2xl leading-snug md:text-3xl">Nothing waiting</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Nothing here needs you right now. That is allowed to be the whole answer.
            </p>
            <Button onClick={onClose} variant="outline" className="mt-8 rounded-full border-tan">
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
