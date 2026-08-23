import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { actions, type Goal } from "@/lib/store";
import { SoftProgress } from "./soft-progress";
import { InlineText } from "./inline-text";

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
export function GoalCard({ goal, tint = "sage" }: { goal: Goal; tint?: Tint }) {
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
        <button
          onClick={() => actions.deleteGoal(goal.id)}
          className="p-1 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:text-[color:var(--clay)]"
          aria-label="Delete goal"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
            <button
              onClick={() => actions.deleteGoalStep(step.id)}
              className="p-1 text-ink-soft opacity-0 transition-opacity group-hover/step:opacity-100 hover:text-[color:var(--clay)]"
              aria-label={`Remove step "${step.title}"`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
    </div>
  );
}
