import { useState, type ReactNode } from "react";
import { CalendarDays, Check, Plus } from "lucide-react";

import { actions, type Goal } from "@/lib/store";
import { DateField } from "@/components/ui/date-field";
import { SoftProgress } from "./soft-progress";
import { InlineText } from "./inline-text";
import { ConfirmDeleteButton } from "./confirm-delete";

type Tint = "sage" | "clay" | "brown" | "tan";

/**
 * A goal is a checklist, not a dial.
 *
 * The percentage used to be set by dragging a slider, which asks "how far along
 * do you feel?" — precisely the judgement call that stalls people. Ticking a
 * concrete step answers itself, and the number falls out of the arithmetic.
 *
 * Goals created before steps existed keep the number they were given and show a
 * plain bar until their first step is added, so nothing resets to zero.
 */
export function GoalCard({
  goal,
  tint = "sage",
  footer,
}: {
  goal: Goal;
  tint?: Tint;
  /** Extra content inside the card, below the steps. Personal uses it for the
   *  daily habits feeding this goal; the other areas have none. */
  footer?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const total = goal.steps.length;
  const done = goal.steps.filter((s) => s.done).length;
  const hasSteps = total > 0;

  function addStep(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    actions.addGoalStep(goal.id, title, total);
    setDraft("");
  }

  return (
    <div className="group card-soft density-p space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <InlineText
            value={goal.name}
            onSave={(v) => v && actions.updateGoal(goal.id, { name: v })}
            showIcon
            className="font-serif text-lg leading-tight"
          />
          <InlineText
            value={goal.description ?? ""}
            placeholder="Add a description…"
            multiline
            onSave={(v) => actions.updateGoal(goal.id, { description: v || undefined })}
            className="mt-1 text-xs text-ink-soft"
          />
        </div>
        <ConfirmDeleteButton
          itemLabel={goal.name}
          consequence="Its steps go with it. This cannot be undone."
          onConfirm={() => actions.deleteGoal(goal.id)}
          className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
          aria-label="Delete goal"
        />
      </div>

      <div className="flex items-center gap-3">
        <SoftProgress value={goal.progress} tint={tint} className="flex-1" />
        <span className="w-9 text-right text-xs tabular-nums text-ink-soft">{goal.progress}%</span>
      </div>

      {hasSteps && (
        <p className="text-[11px] text-ink-soft">
          {done} of {total} done
          {done === total && " — all of it. Well done."}
        </p>
      )}

      {/*
        Optional target date, and deliberately quiet: a small unlabelled field
        that reads as available rather than expected. Most goals should not have
        one, so this must not look like a blank someone forgot to fill in.

        Setting it is what puts the goal on the calendar, which is the only
        reason it exists.
      */}
      <label className="flex items-center gap-2 text-[11px] text-ink-soft">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="shrink-0">Aiming for</span>
        <DateField
          value={goal.targetDate ?? ""}
          onChange={(v) =>
            // Empty clears it. goalPatchToRow turns undefined into an explicit
            // null, so clearing actually removes the date.
            actions.updateGoal(goal.id, { targetDate: v || undefined })
          }
          placeholder="No date"
          aria-label="Target date, optional"
          clearable
          className="h-auto min-w-0 flex-1 gap-1.5 rounded-lg border-transparent bg-transparent px-1.5 py-0.5 text-[11px] text-ink transition-colors hover:border-border focus:border-border focus:outline-none"
        />
      </label>

      <ul className="space-y-1.5">
        {goal.steps.map((step) => (
          <li key={step.id} className="group/step flex items-center gap-2.5">
            <button
              onClick={() => actions.toggleGoalStep(step.id, !step.done)}
              aria-pressed={step.done}
              aria-label={step.done ? `Mark "${step.title}" not done` : `Mark "${step.title}" done`}
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all ${
                step.done ? "border-primary" : "border-border bg-card hover:bg-secondary"
              }`}
              style={
                step.done
                  ? { background: "linear-gradient(135deg, var(--sage-deep), var(--sage))" }
                  : undefined
              }
            >
              {step.done && (
                <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
              )}
            </button>
            <InlineText
              value={step.title}
              onSave={(v) => v && actions.renameGoalStep(step.id, v)}
              className={`flex-1 text-sm ${step.done ? "text-ink-soft line-through" : ""}`}
            />
            <ConfirmDeleteButton
              itemLabel={step.title}
              onConfirm={() => actions.deleteGoalStep(step.id)}
              className="reveal-control p-1 text-ink-soft hover:text-[color:var(--clay)]"
              iconClassName="h-3.5 w-3.5"
              aria-label={`Remove step "${step.title}"`}
            />
          </li>
        ))}
      </ul>

      {adding || total === 0 ? (
        <form onSubmit={addStep} className="flex items-center gap-2">
          <input
            autoFocus={adding}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !draft.trim() && setAdding(false)}
            placeholder={total === 0 ? "First small step…" : "Next step…"}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="chip bg-secondary text-ink-soft disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a step
        </button>
      )}
      {footer}
    </div>
  );
}
