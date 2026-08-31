import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { actions } from "@/lib/store";

/**
 * Drag-to-reorder for the cards on the area pages — goals, projects, habits and
 * courses.
 *
 * Separate from ReorderableSection, which moves whole Overview sections and
 * persists to an ordered array in user_settings. Cards are database rows and
 * rows have no inherent order, so each collection carries a `position` column
 * and reorderCards() writes the new sequence.
 *
 * Pointer events, not HTML5 drag-and-drop: the native API never fires on touch,
 * which would have made this desktop-only. Same reason the calendar moved off it.
 *
 * The handle is always visible at low opacity rather than revealed on hover.
 * ReorderableSection originally hid it, and because the handle sits outside its
 * container's box the hover that was meant to reveal it was lost on the way
 * there — the control faded out as the cursor approached. A drag affordance
 * nobody can reach is not an affordance.
 */

export interface CardDragState {
  id: string;
  overId: string | null;
}

export type ReorderableCollection = "goals" | "projects" | "habits" | "courses";

export function ReorderableCard({
  id,
  collection,
  orderedIds,
  drag,
  setDrag,
  children,
}: {
  id: string;
  collection: ReorderableCollection;
  /** Current order of the whole collection, so a drop can compute the new one. */
  orderedIds: string[];
  drag: CardDragState | null;
  setDrag: (next: CardDragState | null) => void;
  children: ReactNode;
}) {
  const [grabbed, setGrabbed] = useState(false);
  const isDragging = drag?.id === id;
  const isTarget = drag !== null && drag.overId === id && drag.id !== id;

  function commit(from: string, to: string) {
    if (from === to) return;
    const next = [...orderedIds];
    const fromIndex = next.indexOf(from);
    const toIndex = next.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    actions.reorderCards(collection, next);
  }

  return (
    <div
      data-card={id}
      onPointerEnter={() => {
        if (drag && drag.id !== id) setDrag({ ...drag, overId: id });
      }}
      className={`relative transition-opacity ${isDragging ? "opacity-40" : ""} ${
        isTarget
          ? "before:absolute before:-left-2 before:top-0 before:h-full before:w-0.5 before:rounded-full before:bg-primary"
          : ""
      }`}
    >
      <button
        type="button"
        aria-label="Reorder this card. Press and drag, or use arrow keys."
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setGrabbed(true);
          setDrag({ id, overId: null });
        }}
        onPointerMove={(e) => {
          // See reorderable-section: pointer capture means the cards underneath
          // never fire onPointerEnter mid-drag, so the drop target is resolved
          // by hit-testing the cursor instead of waiting to be told.
          if (!drag) return;
          const under = document.elementFromPoint(e.clientX, e.clientY);
          const over = under?.closest("[data-card]")?.getAttribute("data-card") ?? null;
          if (over && over !== drag.overId) setDrag({ ...drag, overId: over });
        }}
        onPointerUp={() => {
          if (drag?.overId) commit(drag.id, drag.overId);
          setGrabbed(false);
          setDrag(null);
        }}
        onPointerCancel={() => {
          setGrabbed(false);
          setDrag(null);
        }}
        onKeyDown={(e) => {
          // Keyboard equivalent — a handle that only answers to a pointer is
          // unusable for anyone not using one.
          if (
            e.key !== "ArrowUp" &&
            e.key !== "ArrowDown" &&
            e.key !== "ArrowLeft" &&
            e.key !== "ArrowRight"
          )
            return;
          e.preventDefault();
          const index = orderedIds.indexOf(id);
          const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
          const target = index + (back ? -1 : 1);
          if (index < 0 || target < 0 || target >= orderedIds.length) return;
          const next = [...orderedIds];
          [next[index], next[target]] = [next[target], next[index]];
          actions.reorderCards(collection, next);
        }}
        className={`absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-lg text-ink-soft opacity-40 transition-all hover:bg-secondary hover:text-ink hover:opacity-100 focus-visible:opacity-100 ${
          grabbed ? "cursor-grabbing bg-secondary text-ink opacity-100" : "cursor-grab"
        }`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {children}
    </div>
  );
}

/**
 * Shared drag state for one collection on a page, plus the handlers a container
 * needs. Kept here so each page does not reimplement the same three lines.
 */
export function useCardDrag() {
  const [drag, setDrag] = useState<CardDragState | null>(null);
  return {
    drag,
    setDrag,
    /** Ends a drag that finished outside any card. */
    endDrag: () => setDrag(null),
  };
}
