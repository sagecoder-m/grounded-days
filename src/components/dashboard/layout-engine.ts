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

/**
 * The four corners, and only the corners.
 *
 * Used to be all eight — every corner and every edge — so a tile could be
 * grabbed from wherever the pointer happened to land. That suited a board you
 * could reach into at any moment. Resizing is now its own mode you step into
 * deliberately, and the brief for it is explicit: four handles, one on each
 * corner, appearing while you are in it. Edge dragging is dropped rather than
 * kept alongside — four visible handles read as a control; four corners plus
 * four invisible edge bands read as a tile that resizes if you brush it.
 */
export const RESIZE_HANDLES: readonly ResizeHandleAxis[] = ["sw", "nw", "se", "ne"];

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
 * Freeform, and a tile that is not being touched holds still unless something
 * lands on it.
 *
 * noCompactor is what stops the board pulling every tile upward, so a gap left
 * on purpose stays a gap.
 *
 * preventCollision used to be on, and the reasoning was sound for what dragging
 * was at the time: it could start from any accidental brush of the handle, so
 * a drag that displaced a neighbour was very often a drag nobody meant to make,
 * and the displacement was permanent because nothing ever compacted the board
 * back. Blocking the overlap outright was the safe default.
 *
 * Dragging is no longer that exposed. It only runs inside "Edit size," a mode
 * someone has to choose to enter, so a collision during it is no longer an
 * accident to guard against — it is the point: push the widget in your way,
 * gently, and leave both where they land. preventCollision is what was
 * blocking exactly that. off restores react-grid-layout's own default
 * behaviour, which nudges a colliding tile aside in the direction of the drag
 * rather than refusing to move at all — still nothing pulls it back afterwards,
 * which is the same "stays where it lands" rule noCompactor already gives
 * everything else.
 */
export const COMPACTOR: Compactor = {
  type: noCompactor.type,
  allowOverlap: false,
  preventCollision: false,
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
