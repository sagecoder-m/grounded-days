import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { actions, type Settings } from "@/lib/store";

/**
 * Drag-to-reorder for the Overview's sections, on the page itself.
 *
 * Reordering already existed, but only in Profile — you had to leave the page
 * you were arranging, move rows in an abstract list, then come back to see the
 * result. Doing it in place means you are dragging the actual thing.
 *
 * Pointer events rather than HTML5 drag-and-drop: the native API does not fire
 * on touch at all, which would have made this desktop-only. Same reason the
 * calendar moved off it.
 *
 * The handle only appears on hover on devices that have a pointer, and is
 * always visible on touch — a control you cannot reveal is a control that does
 * not exist, and there is no hover on a phone.
 */

/** Where a dragged section would land, or null when nothing is being dragged. */
export interface DragState {
  key: string;
  overKey: string | null;
}

export function ReorderableSection({
  sectionKey,
  widgets,
  drag,
  setDrag,
  children,
}: {
  sectionKey: string;
  widgets: Settings["widgets"];
  drag: DragState | null;
  setDrag: (next: DragState | null) => void;
  children: ReactNode;
}) {
  const [grabbed, setGrabbed] = useState(false);
  const isDragging = drag?.key === sectionKey;
  const isTarget = drag !== null && drag.overKey === sectionKey && drag.key !== sectionKey;

  /** Commit the move: pull the dragged key out and drop it at the target. */
  function commit(from: string, to: string) {
    if (from === to) return;
    const next = [...widgets];
    const fromIndex = next.findIndex((w) => w.key === from);
    const toIndex = next.findIndex((w) => w.key === to);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    actions.reorderWidgets(next);
  }

  return (
    <div
      data-section={sectionKey}
      onPointerEnter={() => {
        // Only meaningful mid-drag; setting it otherwise would fight the
        // pointer-up that ends the gesture.
        if (drag && drag.key !== sectionKey) setDrag({ ...drag, overKey: sectionKey });
      }}
      className={`group/section relative transition-opacity ${isDragging ? "opacity-40" : ""} ${
        isTarget
          ? "before:absolute before:-top-3 before:left-0 before:h-0.5 before:w-full before:rounded-full before:bg-primary"
          : ""
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder this section. Press and drag, or use arrow keys.`}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setGrabbed(true);
          setDrag({ key: sectionKey, overKey: null });
        }}
        onPointerUp={() => {
          if (drag?.overKey) commit(drag.key, drag.overKey);
          setGrabbed(false);
          setDrag(null);
        }}
        onPointerCancel={() => {
          setGrabbed(false);
          setDrag(null);
        }}
        onKeyDown={(e) => {
          // Keyboard equivalent, because a drag handle that only responds to a
          // pointer is unusable for anyone not using one.
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const index = widgets.findIndex((w) => w.key === sectionKey);
          const target = index + (e.key === "ArrowUp" ? -1 : 1);
          if (index < 0 || target < 0 || target >= widgets.length) return;
          const next = [...widgets];
          [next[index], next[target]] = [next[target], next[index]];
          actions.reorderWidgets(next);
        }}
        className={`reveal-control absolute -left-1 top-0 z-10 grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-secondary hover:text-ink md:-left-9 ${
          grabbed ? "cursor-grabbing bg-secondary text-ink" : "cursor-grab"
        }`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {children}
    </div>
  );
}
