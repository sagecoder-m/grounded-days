import { useState } from "react";
import { Check, PenSquare } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { WidgetPlacement } from "@/lib/store-types";
import { AddMenu } from "./add-widget";

export type EditMode = "view" | "size" | "add";

/**
 * The one control that opens the board up for changes, and closes it again.
 *
 * Everything about arranging the board used to be live all the time — the
 * drag handle sat on every tile whether you meant to use it or not, and a
 * scroll that clipped the wrong pixel could nudge something out of place.
 * This is what puts a door on that: the board is inert until "Edit Widget" is
 * pressed, and it goes back to inert the moment "Done" is.
 *
 * Two branches inside, not one flat mode, because "make this bigger" and
 * "put a new thing on the board" are different intentions that happen to
 * both start from the same button. "Edit size" is where dragging and
 * resizing actually happen — DashboardCanvas keys both gestures off the same
 * flag this sets. "Add widget" is a list, nothing on the board moves while
 * it is open, and choosing something from it drops it in below everything
 * else exactly as it always has.
 */
export function EditWidgetControl({
  mode,
  onModeChange,
  placements,
  onAdd,
}: {
  mode: EditMode;
  onModeChange: (mode: EditMode) => void;
  placements: WidgetPlacement[];
  /** Called when something is chosen from "Add widget". */
  onAdd: (key: string) => void;
}) {
  /*
    Whether anything was actually added, across the whole time the door has
    been open — not just while "Add widget" happens to be the visible tab.

    Someone can add a widget, switch to "Edit size" to make room for it, and
    press Done from there. The notice has to remember the add happened
    regardless of which tab they finish on, which is why this is a session
    counter rather than something read off whichever branch is on screen when
    Done is pressed.
  */
  const [addedCount, setAddedCount] = useState(0);
  const editing = mode !== "view";

  const done = () => {
    onModeChange("view");
    if (addedCount > 0) {
      // The same toast.success the rest of the app already uses for "a thing
      // was added" — see assistant.tsx's "Task added" — rather than a
      // bespoke notice with its own look and its own timing to get right.
      toast.success(addedCount === 1 ? "Widget added below" : `${addedCount} widgets added below`);
    }
    setAddedCount(0);
  };

  const handleAdd = (key: string) => {
    onAdd(key);
    setAddedCount((n) => n + 1);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {editing && (
        <>
          {/*
            The switch between the two branches. Plain buttons with
            aria-pressed rather than a full tablist — this is two toggles that
            share a row, not a page section with its own semantics.
          */}
          <div className="flex overflow-hidden rounded-full border border-tan">
            <ModeButton active={mode === "size"} onClick={() => onModeChange("size")}>
              Edit size
            </ModeButton>
            <ModeButton active={mode === "add"} onClick={() => onModeChange("add")}>
              Add widget
            </ModeButton>
          </div>

          {mode === "add" &&
            (placements.some((p) => !p.enabled) ? (
              <AddMenu placements={placements} onAdd={handleAdd} />
            ) : (
              <span className="text-xs italic text-ink-soft">
                Everything is already on your board.
              </span>
            ))}
        </>
      )}

      <button
        type="button"
        onClick={editing ? done : () => onModeChange("size")}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
          editing
            ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
            : "border-tan text-ink-soft hover:border-tan hover:text-ink",
        )}
      >
        {editing ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Done
          </>
        ) : (
          <>
            <PenSquare className="h-3.5 w-3.5" />
            Edit Widget
          </>
        )}
      </button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
