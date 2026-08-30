import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales its contents down until they fit the height they were given.
 *
 * A square tile has a height decided by its width, not by what is in it, so on
 * a full day the day does not fit. The three ways out are to scroll it, to
 * truncate it, or to shrink it, and the brief picked shrinking: nothing hidden,
 * nothing to scroll, the whole day visible at once even if small.
 *
 * transform rather than font-size, because almost every length in this app is
 * in rem and rem ignores an ancestor's font-size — setting it here would move
 * the text and leave the padding, gaps and card radii at full size. A transform
 * takes the finished layout and scales all of it together, which is what
 * "everything fits" has to mean.
 *
 * Width is left alone at 100%. Compensating it (width: 100/scale%) would make
 * the content re-wrap at the new width, changing its height, changing the
 * scale — a loop with no fixed point. The cost is that scaled content is
 * narrower than its tile, so transform-origin is "top center" and the slack
 * falls evenly either side, reading as padding rather than as a layout that
 * failed to reach the edge.
 */
export function FitToBox({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;

    const measure = () => {
      const available = box.clientHeight;
      // scrollHeight is the laid-out height and a transform does not affect
      // layout, so this stays the natural height however far it is scaled —
      // which is what lets the scale be recomputed from it without drifting.
      const needed = content.scrollHeight;
      if (!available || !needed) return;
      /*
        Floored at 0.55. Past that the text is too small to read, and a tile
        nobody can read is worse than one that admits it is full — better to
        let a genuinely enormous day overflow its square than to render the
        whole Overview in six-point type.
      */
      const next = needed > available ? Math.max(0.55, available / needed) : 1;
      // Rounded, and only taken when it moves: sub-pixel jitter in the measured
      // height would otherwise set state on every animation frame.
      const rounded = Math.round(next * 100) / 100;
      setScale((prev) => (Math.abs(prev - rounded) < 0.02 ? prev : rounded));
    };

    measure();
    // Both boxes: the tile changes height when the window does, and the content
    // changes height when a task is ticked or an event arrives. Observing them
    // is what makes the deps array empty rather than wrong — re-running this on
    // every render would tear down and rebuild the observer each time, and the
    // observer is already the thing that notices content changing.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="h-full overflow-hidden">
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}
