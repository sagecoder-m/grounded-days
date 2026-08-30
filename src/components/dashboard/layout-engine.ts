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
 * Nothing inside a tile that already answers a press may start a drag.
 *
 * A tile is dragged by its body, not by a handle in one corner, because a
 * handle is a thing to find before you can move anything. The cost is that the
 * body is full of buttons, checkboxes and links — so those are excluded here
 * and keep their own behaviour. The drag threshold does the rest: a press that
 * never travels is a click.
 */
export const DRAG_CANCEL_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[contenteditable='true']",
  ".react-resizable-handle",
].join(", ");

/**
 * How far a pointer must travel before it counts as a drag rather than a click.
 *
 * Three pixels is the library's default and too eager on a trackpad, where a
 * click routinely wanders a pixel or two; six leaves ticking a checkbox
 * reliable without making a deliberate drag feel sticky.
 */
export const DRAG_THRESHOLD = 6;

/**
 * Freeform: a widget stays where it was put.
 *
 * The default compactor pulls every tile upward, so a deliberate gap closes
 * itself the moment you look away and an asymmetric layout is impossible to
 * keep. noCompactor is what makes the board honour the arrangement instead of
 * correcting it.
 */
export const COMPACTOR = noCompactor;

/** Smallest a widget may be dragged down to, in grid units — roughly 200x120px,
 *  under which a card stops being able to say anything. */
export const MIN_W = 6;
export const MIN_H = 6;

/** A placement as the engine wants it. */
export function toLayoutItem(p: WidgetPlacement): LayoutItem {
  return { i: p.key, x: p.x, y: p.y, w: p.w, h: p.h, minW: MIN_W, minH: MIN_H };
}

/** The engine's layout back into placements, keeping `enabled` from the ones we
 *  already hold — the engine only ever sees the widgets that are on the board. */
export function fromLayout(layout: Layout, current: WidgetPlacement[]): WidgetPlacement[] {
  const byKey = new Map(layout.map((l) => [l.i, l]));
  return current.map((p) => {
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
