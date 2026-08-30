import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout";

import type { WidgetPlacement } from "@/lib/store-types";
import { WidgetShell } from "./widget-shell";
import { isPinned, widgetSpec } from "./widget-registry";
import {
  BOARD_COLS,
  BOARD_MARGIN,
  CANVAS_MIN_WIDTH,
  COMPACTOR,
  DRAG_CANCEL_SELECTOR,
  DRAG_THRESHOLD,
  MIN_H,
  MIN_W,
  RESIZE_HANDLES,
  ROW_HEIGHT,
  fromLayout,
} from "./layout-engine";

/**
 * The board: widgets placed wherever they were put, dragged and resized freely.
 *
 * The important structural choice is that drag state and saved state are
 * separate. The engine moves tiles on every pointer frame; writing that to the
 * database would be hundreds of round trips for one gesture, and feeding it
 * back through React would put the tile behind the cursor. So the engine owns
 * the layout while a gesture is in progress and `onPersist` is called once, on
 * release.
 */
/**
 * The board's own width, measured rather than assumed.
 *
 * The engine ships a hook for this, and it measured once and then stopped
 * reacting: the tiles were laid out for whatever width happened to be true on
 * first paint, so once the container settled to its real size — a max-width
 * applying, a rail collapsing — every tile was sized for a board wider than the
 * one it was in, and hung off the right-hand edge.
 *
 * A ResizeObserver on the element we actually render is the whole fix. It fires
 * for any reason the box changes, not just a window resize, which is the case
 * the hook was missing.
 */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      // Sub-pixel jitter would otherwise re-render the whole board on scroll.
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export function DashboardCanvas({
  placements,
  onPersist,
  onRemove,
  render,
}: {
  placements: WidgetPlacement[];
  /** Called once per gesture, on release — never mid-drag. */
  onPersist: (next: WidgetPlacement[]) => void;
  onRemove: (key: string) => void;
  /** Draws one widget's contents. The shell and placement are handled here. */
  render: (key: string) => ReactNode;
}) {
  const { ref: containerRef, width } = useMeasuredWidth();
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const onBoard = useMemo(() => placements.filter((p) => p.enabled), [placements]);

  const layout: Layout = useMemo(
    () =>
      onBoard.map((p) => {
        const spec = widgetSpec(p.key);
        return {
          i: p.key,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          minW: spec?.min?.w ?? MIN_W,
          minH: spec?.min?.h ?? MIN_H,
          /*
            Pinned furniture. All three flags, not just `static`: static alone
            still rendered the eight resize handles, so the header could be
            pulled out of shape even though it could not be dragged. isDraggable
            and isResizable are what actually withhold the gestures; static is
            what makes the other tiles lay out around it rather than through it.
          */
          static: spec?.pinned === true,
          isDraggable: spec?.pinned !== true,
          isResizable: spec?.pinned !== true,
        };
      }),
    [onBoard],
  );

  /* Saved on release only — see the note above about drag state. */
  const commit = useCallback(
    (next: Layout) => {
      setDraggingKey(null);
      onPersist(fromLayout(next, placements));
    },
    [onPersist, placements],
  );

  const narrow = width > 0 && width < CANVAS_MIN_WIDTH;

  return (
    /*
      One element, always, and the measured one.

      The ref used to move between the two branches below, and the consequence
      was one-way: the hook sets up its ResizeObserver once, so the moment the
      board flipped to the stacked layout the observer was left watching a
      detached node. Widening the window then reported nothing, and the board
      never came back. Measuring a wrapper that never unmounts is what makes the
      switch work in both directions.
    */
    <div ref={containerRef} className="min-w-0">
      {narrow ? (
        /*
          Too narrow to aim at: the widgets stack in reading order, full width.

          The saved layout is untouched — this is a way of drawing it, not a
          rewrite of it — so widening the window brings the arrangement back
          exactly as it was. Thirty-six columns of a 700px board would be 15px
          each: precision nobody can use, in tiles nobody can read.
        */
        <div className="flex flex-col gap-3.5">
          {/* The pinned header first regardless of its saved y, then the rest
              in reading order — it is the page's heading in this layout too. */}
          {[...onBoard]
            .sort(
              (a, b) => Number(isPinned(b.key)) - Number(isPinned(a.key)) || a.y - b.y || a.x - b.x,
            )
            .map((p) => (
              <WidgetShell
                key={p.key}
                title={widgetSpec(p.key)?.label ?? p.key}
                onRemove={isPinned(p.key) ? undefined : () => onRemove(p.key)}
              >
                {render(p.key)}
              </WidgetShell>
            ))}
        </div>
      ) : (
        /* Nothing until the width is known: rendering at the hook's 1280px
           guess and then correcting makes every tile jump on first paint. */
        width > 0 && (
          <GridLayout
            width={width}
            layout={layout}
            compactor={COMPACTOR}
            gridConfig={{
              cols: BOARD_COLS,
              rowHeight: ROW_HEIGHT,
              margin: BOARD_MARGIN,
              containerPadding: [0, 0],
            }}
            dragConfig={{
              enabled: true,
              // Bounded so a tile cannot be dragged off the left edge into a
              // negative column and become unreachable.
              bounded: true,
              cancel: DRAG_CANCEL_SELECTOR,
              threshold: DRAG_THRESHOLD,
            }}
            resizeConfig={{ enabled: true, handles: RESIZE_HANDLES }}
            onDragStart={(_l, item) => setDraggingKey(item?.i ?? null)}
            onDragStop={commit}
            onResizeStart={(_l, item) => setDraggingKey(item?.i ?? null)}
            onResizeStop={commit}
          >
            {onBoard.map((p) => (
              <WidgetShell
                key={p.key}
                title={widgetSpec(p.key)?.label ?? p.key}
                onRemove={isPinned(p.key) ? undefined : () => onRemove(p.key)}
                dragging={draggingKey === p.key}
              >
                {render(p.key)}
              </WidgetShell>
            ))}
          </GridLayout>
        )
      )}
    </div>
  );
}
