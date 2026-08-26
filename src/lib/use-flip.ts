import { useLayoutEffect, useRef } from "react";

/**
 * FLIP: animate elements from where they were to where they now are.
 *
 * Grid does not transition. When a tile moves from one cell to another its new
 * position is simply true on the next frame, so a reorder is a jump-cut no
 * matter what CSS transition is declared. The way round it is to measure before
 * and after, apply the difference as a transform, and let that transform animate
 * away — First, Last, Invert, Play.
 *
 * Only runs when `key` changes, so an unrelated re-render does not re-animate a
 * board that has not moved.
 */
export function useFlip(
  /** Changes exactly when the layout should animate — usually the order joined. */
  key: string,
  options: {
    /** Selector for the elements to track. Each needs a stable identity. */
    selector: string;
    /** Attribute holding that identity. */
    idAttribute: string;
    /** Left alone: the tile under the cursor is already where the hand put it,
     *  and animating it would fight the drag. */
    skipId?: string | null;
  },
) {
  const { selector, idAttribute, skipId } = options;
  const previous = useRef(new Map<string, DOMRect>());
  /** In-flight animations by element id, so a new one can replace rather than
   *  layer on top of the old. */
  const running = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));

    // Honour the system setting. An app this deliberately calm should not be
    // the one thing on the machine that ignores "reduce motion".
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const next = new Map<string, DOMRect>();
    for (const node of nodes) {
      const id = node.getAttribute(idAttribute);
      if (!id) continue;
      const rect = node.getBoundingClientRect();
      next.set(id, rect);

      if (still || id === skipId) continue;
      const before = previous.current.get(id);
      if (!before) continue;

      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      // Sub-pixel drift is not movement worth animating.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      // 2. Replace, do not stack. Dragging across several tiles starts a new
      //    animation on the same element before the previous one has finished,
      //    and two transforms fighting on one node is what makes a sweep look
      //    frantic. Cancelling the old one means each tile is only ever
      //    travelling to one place.
      running.current.get(id)?.cancel();

      const animation = node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        {
          duration: 420,
          // Eases in as well as out. The previous curve (0.2, 0, 0, 1) left at
          // almost full speed, which is what read as a snap rather than a move —
          // at this duration you can follow a tile with your eye.
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        },
      );
      running.current.set(id, animation);
    }

    previous.current = next;
  }, [key, selector, idAttribute, skipId]);
}
