import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout";

import type { WidgetPlacement } from "@/lib/store-types";
import { WidgetShell } from "./widget-shell";
import {
  isPinned,
  isReflective,
  mobileRank,
  trimsOwnContent,
  widgetLabel,
  widgetSpec,
} from "./widget-registry";
import { MobileReflection } from "./mobile-reflection";
import {
  BOARD_COLS,
  BOARD_MARGIN,
  CANVAS_MIN_WIDTH,
  COMPACTOR,
  DRAG_HANDLE_SELECTOR,
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
      onPersist(fromLayout(next, placements, isPinned));
    },
    [onPersist, placements],
  );

  const narrow = width > 0 && width < CANVAS_MIN_WIDTH;

  /*
    The stacked layout, split into the part about today and the part about how
    the fortnight went. Sorted once and then partitioned, so the drawer's
    contents keep the order they would have had in the column.
  */
  const stacked = useMemo(() => {
    const ordered = [...onBoard].sort((a, b) => mobileRank(a.key) - mobileRank(b.key));
    return {
      everyday: ordered.filter((p) => !isReflective(p.key)),
      reflective: ordered.filter((p) => isReflective(p.key)),
    };
  }, [onBoard]);

  const renderStacked = (p: (typeof onBoard)[number]) => (
    <WidgetShell
      key={p.key}
      title={widgetSpec(p.key)?.label ?? p.key}
      onRemove={isPinned(p.key) ? undefined : () => onRemove(p.key)}
      pinned={isPinned(p.key)}
      /*
        A height budget, which is what makes the lists stop being endless.

        FitRows only trims when it has a bounded height to measure against, and
        on the canvas that comes from the tile someone sized. Stacked, nothing
        bounded anything — so every widget rendered in full and "A look at
        today" put eleven to-dos on screen, one after another, with Upcoming
        doing the same below it. That is the wall people describe.

        26rem is about two thirds of a phone screen: enough that a quiet day
        shows completely and nothing is trimmed, low enough that a busy one
        becomes "+6 more" instead of a scroll.

        Only for widgets that trim themselves. A capped list says how much it
        left out; a capped chart is a chart with its bottom cut off, which is
        worse than a long one.
      */
      className={trimsOwnContent(p.key) ? "max-h-[26rem]" : undefined}
    >
      {render(p.key)}
    </WidgetShell>
  );

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
          {/*
            Ordered by what each widget is for, not by where it sits on the
            board. A board has no reading order — things are side by side and
            the eye picks — but one column forces one, and the saved x/y gave
            the wrong answer: on the default arrangement a phone met two
            analysis charts before today's list, purely because those charts sit
            to its left on a wide screen. See mobileRank in the registry.

            Then split: the day's own widgets stay in the column, and the charts
            fold into one tappable line at the end of it. Both halves keep the
            sort, so the drawer's contents are in the same order they would have
            been in had they stayed.
          */}
          {stacked.everyday.map(renderStacked)}
          {stacked.reflective.length > 0 && (
            <MobileReflection labels={stacked.reflective.map((p) => widgetLabel(p.key))}>
              {stacked.reflective.map(renderStacked)}
            </MobileReflection>
          )}
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
              handle: DRAG_HANDLE_SELECTOR,
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
                pinned={isPinned(p.key)}
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
