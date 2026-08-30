import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shows as many rows as fit the height it has been given, then says how many
 * it did not show.
 *
 * A widget's height is the user's choice now, so content longer than the box is
 * routine rather than exceptional. Of the three ways out, this is the one that
 * was asked for: not scrolling (a list you have to scroll to finish reading is
 * not a glance), not shrinking (a busy day becomes unreadable), but showing
 * what fits and being honest about the rest.
 *
 * The measurement is in two phases, and it has to be.
 *
 * Hiding a row changes the layout, so measuring the layout after hiding gives a
 * different answer, which changes what is hidden — a loop with no fixed point.
 * So whenever the inputs change (the number of rows, or the height available)
 * the component first renders every row, measures that, and only then settles
 * on a cutoff. Hiding trailing rows cannot move the rows above them, so the
 * measurement stays true once settled.
 */
export function FitRows({
  children,
  className,
  /** Drawn when rows had to be left out. Given the number hidden. */
  renderMore,
  moreClassName,
}: {
  children: ReactNode[];
  className?: string;
  renderMore?: (hidden: number) => ReactNode;
  /** Classes for the wrapper around the "more" line. The measured box is
   *  sometimes a grid, where the line has to span every column. */
  moreClassName?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const total = children.length;
  /** null while measuring — every row is rendered so it can be measured. */
  const [visible, setVisible] = useState<number | null>(null);
  /** Bumped to force a fresh measurement when the box changes size. */
  const [sizeKey, setSizeKey] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let last = box.clientHeight;
    const ro = new ResizeObserver(() => {
      const next = box.clientHeight;
      // A pixel of jitter is not a resize, and re-measuring on every one of
      // them would re-render the list continuously.
      if (Math.abs(next - last) < 2) return;
      last = next;
      setVisible(null);
      setSizeKey((k) => k + 1);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Re-enter the measuring phase whenever the rows themselves change.
  useLayoutEffect(() => {
    setVisible(null);
  }, [total]);

  useLayoutEffect(() => {
    // Only measure in the measuring phase, when every row is on screen.
    if (visible !== null) return;
    const box = boxRef.current;
    if (!box || total === 0) return;

    const available = box.clientHeight;
    if (available <= 0) return;

    const rows = Array.from(box.querySelectorAll<HTMLElement>("[data-fit-row]"));
    if (rows.length === 0) return;

    // Everything fits: no cutoff, and no "more" line to leave room for.
    const lastRow = rows[rows.length - 1];
    if (lastRow.offsetTop + lastRow.offsetHeight <= available) {
      setVisible(total);
      return;
    }

    // Something will be hidden, so the "more" line needs room of its own.
    const moreHeight = moreRef.current?.offsetHeight ?? 0;
    const budget = available - moreHeight;
    let fits = 0;
    for (const row of rows) {
      if (row.offsetTop + row.offsetHeight > budget) break;
      fits += 1;
    }
    // At least one row, even in a box too short for it: an empty widget with a
    // "+7 more" under it says nothing at all.
    setVisible(Math.max(1, fits));
  }, [visible, total, sizeKey]);

  const measuring = visible === null;
  const shown = measuring ? children : children.slice(0, visible);
  const hidden = measuring ? 0 : total - shown.length;

  return (
    <div ref={boxRef} className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {shown}
      {/*
        Rendered during measurement too, and only then made invisible, so its
        height is known before it is needed. Measuring it after the cutoff was
        chosen would be measuring the thing the cutoff depends on.
      */}
      {renderMore && (hidden > 0 || measuring) && (
        <div
          ref={moreRef}
          className={cn("shrink-0", moreClassName, measuring && "invisible")}
          aria-hidden={measuring}
        >
          {renderMore(hidden)}
        </div>
      )}
    </div>
  );
}
