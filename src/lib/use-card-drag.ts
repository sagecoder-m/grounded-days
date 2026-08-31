import { useState } from "react";

/** Which card is being dragged, and what it is currently over. */
export interface CardDragState {
  id: string;
  overId: string | null;
}

/**
 * Shared drag state for one collection on a page, plus the handlers a container
 * needs. Kept here so each page does not reimplement the same three lines.
 *
 * A hook rather than a component, which is why it lives in lib: it was exported
 * from reorderable-card.tsx, and a module that exports both a component and a
 * hook cannot be hot-reloaded as a component.
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
