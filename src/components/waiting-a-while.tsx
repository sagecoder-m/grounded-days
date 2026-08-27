import { useState } from "react";
import { format, parseISO } from "date-fns";

import { actions, todayISO } from "@/lib/store";
import type { Task } from "@/lib/store-types";
import { Button } from "@/components/ui/button";

/**
 * The way back in after a gap.
 *
 * Stop for three weeks and the first thing a planner does is show you everything
 * you did not do, dated, in a list. That is the moment people close the tab for
 * good — and it lands hardest on exactly the people this app is for, because
 * disappearing for a fortnight is a symptom rather than a choice.
 *
 * So the pile gets an offer instead of a scolding. Two ways out, and neither
 * destroys anything:
 *
 *   Bring them to today   the dates move forward; the work is still there
 *   Let them rest         the dates are cleared; the tasks stay in their lists,
 *                         simply no longer late
 *
 * "Let them rest" clearing the date rather than deleting is the important part.
 * Deleting would make the gentle option the destructive one, so the safe choice
 * would be to keep carrying the pile — which is the trap this exists to open.
 * Undated is a real state in this app already, and it is precisely "I still mean
 * to, just not on a schedule".
 *
 * On the one number here: the count is in the body, never the headline. Before a
 * bulk action across dozens of rows you have to be told what it will touch — but
 * "You have 47 overdue tasks" as the first thing you read is the accusation this
 * is meant to replace.
 */

export function WaitingAWhile({ tasks, onDismiss }: { tasks: Task[]; onDismiss: () => void }) {
  const [done, setDone] = useState<"forward" | "rested" | null>(null);
  const [failed, setFailed] = useState(false);
  const ids = tasks.map((t) => t.id);
  const oldest = tasks[0]?.date;

  /**
   * Run the write, and never leave the button looking broken.
   *
   * The action throws synchronously if there is no signed-in context, which
   * would abort this handler and leave the panel sitting there having visibly
   * done nothing — the same silent-failure shape as a click that misses. Saying
   * "that did not work" is worth more than a button that appears inert.
   */
  function apply(patch: Partial<Task>, outcome: "forward" | "rested") {
    try {
      actions.updateTasks(ids, patch);
      setDone(outcome);
    } catch {
      setFailed(true);
    }
  }

  const bringForward = () => apply({ date: todayISO() }, "forward");
  // Undefined clears the column: taskPatchToRow writes null for a key that is
  // present and undefined, which is what "no longer has a date" means here.
  const letRest = () => apply({ date: undefined }, "rested");

  if (failed) {
    return (
      <section className="card-soft mb-6 p-5">
        <p className="text-sm text-ink">
          That didn&rsquo;t go through &mdash; nothing was changed. Worth a refresh, then try again.
        </p>
      </section>
    );
  }

  if (done) {
    return (
      <section className="card-soft mb-6 p-5">
        <p className="text-sm text-ink">
          {done === "forward"
            ? "Moved to today. Take them one at a time."
            : "Set down. They are still in your lists whenever you want them."}
        </p>
      </section>
    );
  }

  return (
    <section className="card-soft mb-6 p-5 md:p-6">
      <h2 className="font-serif text-lg">Some things have been waiting</h2>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {tasks.length} of them
        {oldest ? `, the oldest from ${format(parseISO(oldest), "d MMMM")}` : ""}. You can bring
        them to today, or set them down &mdash; either way they stay in your lists. Nothing is
        deleted and nothing is counted against you.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={bringForward} className="rounded-full">
          Bring them to today
        </Button>
        <Button onClick={letRest} variant="outline" className="rounded-full border-tan">
          Let them rest
        </Button>
        {/* Third, and quiet: doing nothing has to stay an option that does not
            look like the wrong one. */}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3 text-sm text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          Leave them for now
        </button>
      </div>
    </section>
  );
}
