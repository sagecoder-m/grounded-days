import { useState } from "react";
import { actions, type Goal } from "@/lib/store";
import { SoftProgress } from "./soft-progress";
import { Slider } from "@/components/ui/slider";
import { Trash2 } from "lucide-react";
import { InlineText } from "./inline-text";

export function GoalCard({ goal, tint = "sage" }: { goal: Goal; tint?: "sage" | "clay" | "brown" | "tan" }) {
  // null means "not dragging — show the stored value".
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? goal.progress;

  return (
    <div className="group card-soft density-p p-4 space-y-3">
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
            className="text-xs text-ink-soft mt-1"
          />
        </div>
        <button
          onClick={() => actions.deleteGoal(goal.id)}
          className="opacity-0 group-hover:opacity-100 text-ink-soft hover:text-[color:var(--clay)] p-1"
          aria-label="Delete goal"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <SoftProgress value={shown} tint={tint} className="flex-1" />
        <span className="text-xs tabular-nums text-ink-soft w-9 text-right">{shown}%</span>
      </div>
      {/*
        Dragging updates local state only; the write fires once on release via
        onValueCommit. Without the mirror the thumb would stick and snap back
        waiting on the round trip, and without onValueCommit every step of the
        drag would be its own request.
      */}
      <Slider
        value={[shown]}
        onValueChange={(v) => setDraft(v[0])}
        onValueCommit={(v) => {
          setDraft(null);
          if (v[0] !== goal.progress) actions.updateGoal(goal.id, { progress: v[0] });
        }}
        max={100}
        step={5}
        className="pt-1"
      />
    </div>
  );
}
