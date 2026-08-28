import { useState } from "react";
import { Plus } from "lucide-react";

import { actions } from "@/lib/store";
import type { Goal } from "@/lib/store-types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InlineText } from "@/components/inline-text";
import { FocusOverlay } from "@/components/focus-overlay";
import { ConfirmDeleteButton } from "@/components/confirm-delete";

/**
 * One goal and its tasks, full screen and nothing else.
 *
 * The brief draws this as the end of the road through Professional: project,
 * then sub-project, then a single goal blown up to fill the window with the rest
 * of the page blurred behind it, labelled "focus point". Everything above it in
 * that hierarchy is a place to choose from; this is the place to work.
 *
 * So it deliberately carries less than the card it came from. No progress bar,
 * no counts, no sibling goals, no navigation — a step list large enough to read
 * across the room and one field to add to it. What you can do here is tick
 * something off or write the next thing down.
 */
export function GoalFocus({
  goal,
  eyebrow,
  onClose,
}: {
  goal: Goal;
  /** Where this sits: "Project · Sub-project". */
  eyebrow?: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");

  function addStep(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    actions.addGoalStep(goal.id, title, goal.steps.length);
    setDraft("");
  }

  return (
    <FocusOverlay
      title={goal.name}
      eyebrow={eyebrow}
      onClose={onClose}
      footer={
        /* The date, and it stays easy to move — the brief asks for it to be
           flexible, and a target you cannot change quietly becomes a target you
           lie about. Undated is a real state and the way back to it. */
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>Aiming for</span>
          <input
            type="date"
            value={goal.targetDate ?? ""}
            onChange={(e) =>
              actions.updateGoal(goal.id, { targetDate: e.target.value || undefined })
            }
            className="rounded-full border border-border bg-transparent px-3 py-1.5 text-xs text-ink"
            aria-label="Target date"
          />
          {goal.targetDate && (
            <button
              type="button"
              onClick={() => actions.updateGoal(goal.id, { targetDate: undefined })}
              className="underline underline-offset-4 hover:text-ink"
            >
              no date
            </button>
          )}
        </label>
      }
    >
      {goal.description && (
        <p className="-mt-4 mb-8 text-sm leading-relaxed text-ink-soft">{goal.description}</p>
      )}

      <div className="space-y-1">
        {goal.steps.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm italic text-ink-soft">
            No steps yet. One line is enough to start.
          </p>
        )}

        {goal.steps.map((step) => (
          <div key={step.id} className="group flex items-center gap-3 rounded-2xl px-2 py-2.5">
            <Checkbox
              checked={step.done}
              onCheckedChange={() => actions.toggleGoalStep(step.id, !step.done)}
              className="h-5 w-5 shrink-0 rounded-md border-tan data-[state=checked]:border-primary data-[state=checked]:bg-primary"
            />
            {/* Bigger than a list row elsewhere. This is the one thing on the
                screen, and it should read like it. */}
            <InlineText
              value={step.title}
              onSave={(v) => v && actions.renameGoalStep(step.id, v)}
              className={`min-w-0 flex-1 text-lg ${
                step.done ? "text-ink-soft line-through decoration-1" : ""
              }`}
            />
            <ConfirmDeleteButton
              itemLabel={step.title}
              onConfirm={() => actions.deleteGoalStep(step.id)}
              aria-label="Delete step"
              className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
            />
          </div>
        ))}
      </div>

      <form onSubmit={addStep} className="mt-6 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a step…"
          aria-label="Add a step"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-ink-soft transition-colors hover:bg-secondary hover:text-ink disabled:opacity-40"
          aria-label="Add"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </FocusOverlay>
  );
}
