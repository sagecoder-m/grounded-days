/**
 * The board's layout engine, and the only file that knows which library draws it.
 *
 * Everything above this module talks in WidgetPlacement (key/x/y/w/h) and never
 * imports react-grid-layout directly, so swapping the engine means rewriting
 * this file and nothing else.
 *
 * Why an engine at all: the board used to be a CSS grid with a handful of named
 * shapes, and every shape was a rule about what a widget was allowed to be.
 * Free positioning is not something a CSS grid can be talked into — it needs
 * collision detection, drag state kept apart from layout state, and pointer
 * maths — so this is a mature library rather than a hand-rolled drag system.
 */
import {
  noCompactor,
  type Compactor,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
} from "react-grid-layout";

import type { WidgetPlacement } from "@/lib/store-types";

/**
 * Columns across the board.
 *
 * Thirty-six rather than twelve: the snap has to be fine enough that placing a
 * widget feels like putting it down rather than being told where it goes, and
 * coarse enough that edges line up without effort. Thirty-six still divides
 * cleanly into halves (18), thirds (12) and quarters (9), so the tidy layouts
 * remain one drag away without being the only ones available.
 */
export const BOARD_COLS = 36;

/** A row in pixels. Small, so height is nearly continuous rather than stepped. */
export const ROW_HEIGHT = 20;

/** [horizontal, vertical] gap between tiles, in pixels. */
export const BOARD_MARGIN: readonly [number, number] = [14, 14];

/**
 * Below this board width the canvas stops being a canvas.
 *
 * Thirty-six columns of a 700px board are 15px each: fine positioning that
 * nobody can aim at, and tiles too narrow to read. Under it the widgets stack
 * in reading order at full width instead — the layout is kept, not destroyed,
 * and comes back the moment there is room for it.
 */
export const CANVAS_MIN_WIDTH = 760;

/** Every corner and every edge, so a tile can be resized from wherever the
 *  pointer happens to be. */
export const RESIZE_HANDLES: readonly ResizeHandleAxis[] = [
  "s",
  "w",
  "e",
  "n",
  "sw",
  "nw",
  "se",
  "ne",
];

/**
 * Dragging happens by a handle, and only by a handle.
 *
 * The tile body was the drag surface for a while, with every interactive thing
 * inside it excluded so buttons still worked. That reads fine on an empty tile
 * and badly on a real one: a day's list is nothing but checkboxes, links and
 * inline-editable titles, so almost none of the tile was left to grab and
 * moving a widget became a hunt for a few dead pixels.
 *
 * A handle inverts it. Everything in the tile stays live, and there is exactly
 * one place that moves it — which is also the only honest way to signal that a
 * tile can be moved at all.
 */
export const DRAG_HANDLE_CLASS = "widget-drag-handle";
export const DRAG_HANDLE_SELECTOR = `.${DRAG_HANDLE_CLASS}`;

/**
 * How far a pointer must travel before it counts as a drag rather than a click.
 *
 * Three pixels is the library's default and too eager on a trackpad, where a
 * click routinely wanders a pixel or two; six leaves ticking a checkbox
 * reliable without making a deliberate drag feel sticky.
 */
export const DRAG_THRESHOLD = 6;

/**
 * Freeform, and nothing moves that was not grabbed.
 *
 * Two separate behaviours, and both are needed.
 *
 * noCompactor is what stops the board pulling every tile upward, so a gap left
 * on purpose stays a gap.
 *
 * preventCollision is what stops a drag rearranging the widgets around it. Left
 * off — which is noCompactor's default — dragging one tile onto another pushes
 * that one out of the way, and because nothing ever compacts it back, every
 * move permanently displaced whatever it passed. The board could not be kept in
 * any arrangement for longer than the next drag. With it on, a tile that would
 * land on an occupied spot simply does not land there, and everything else
 * stays exactly where it was put.
 */
export const COMPACTOR: Compactor = {
  type: noCompactor.type,
  allowOverlap: false,
  preventCollision: true,
  compact: (layout, cols) => noCompactor.compact(layout, cols),
};

/** Smallest a widget may be dragged down to, in grid units — roughly 200x120px,
 *  under which a card stops being able to say anything. */
export const MIN_W = 6;
export const MIN_H = 6;

/** A placement as the engine wants it. */
export function toLayoutItem(p: WidgetPlacement): LayoutItem {
  return { i: p.key, x: p.x, y: p.y, w: p.w, h: p.h, minW: MIN_W, minH: MIN_H };
}

/**
 * The engine's layout back into placements.
 *
 * `enabled` comes from what we already hold, since the engine only ever sees
 * the widgets that are on the board.
 *
 * Pinned furniture is read straight back from `current` and never from the
 * engine. It should be impossible for a static item to move, but "should be" is
 * not the standard for the page's own header: whatever the engine reports about
 * it, its position is not something a drag is allowed to write. This is the one
 * place every gesture funnels through, so the guarantee holds here or nowhere.
 */
export function fromLayout(
  layout: Layout,
  current: WidgetPlacement[],
  isPinned: (key: string) => boolean,
): WidgetPlacement[] {
  const byKey = new Map(layout.map((l) => [l.i, l]));
  return current.map((p) => {
    if (isPinned(p.key)) return p;
    const l = byKey.get(p.key);
    return l ? { ...p, x: l.x, y: l.y, w: l.w, h: l.h } : p;
  });
}

/**
 * Somewhere to put a widget that is being switched on.
 *
 * Directly under everything already placed, at its preferred size. Deliberately
 * not "the first hole that fits": dropping a new tile into a gap someone left on
 * purpose is exactly the kind of help that reads as interference, and the bottom
 * of the board is always empty, always visible, and always easy to drag away
 * from.
 */
export function placeBelow(
  existing: WidgetPlacement[],
  w: number,
  h: number,
): Pick<WidgetPlacement, "x" | "y" | "w" | "h"> {
  const bottom = existing.reduce((max, p) => (p.enabled ? Math.max(max, p.y + p.h) : max), 0);
  return { x: 0, y: bottom, w, h };
}
