import { useEffect, useMemo, useRef, useState } from "react";
import { Area as RArea, AreaChart, Customized, ResponsiveContainer, XAxis } from "recharts";

import { AREA_META } from "@/lib/store";
import type { AppState, Area } from "@/lib/store-types";
import { rhythmRiver, type RiverWeek } from "@/lib/user-insights";

/**
 * The rhythm river: how a life has been flowing across its areas.
 *
 * A wiggle-offset stacked area chart. Wiggle, not silhouette and certainly not
 * zero-based, because the offset is the argument: the stack rides its own
 * meandering centreline, so no band sits on a floor it could fall below and none
 * climbs toward a ceiling. There is no axis to be measured against, so the only
 * thing the shape can say is "more of this lately, less of that".
 *
 * Recharts already does the wiggle — it forwards stackOffset to d3-shape's
 * stackOffsetWiggle — so this needed no new dependency.
 *
 * What it refuses to do, and these are the point rather than omissions:
 *
 * - No number appears anywhere. Not on the chart, not in the summary, not in a
 *   hover. The moment a count shows up it becomes a score, and a score invites a
 *   verdict about a person's month.
 * - No red, no amber, no second hue. The palette is the three area colours and
 *   nothing else, so a thin band cannot read as a warning.
 * - A quiet week is a narrow band, drawn exactly like a full one. Not greyed
 *   out, not dashed, not flagged as missing.
 * - The summary describes the pattern and never grades it.
 *
 * Kept self-contained on purpose: it reads a state prop, owns its own maths, and
 * renders one section. Swapping it against the calendar heatmap or the progress
 * cards is a one-line change in the Overview's widget switch, not a refactor.
 */

const WEEKS = 12;

/**
 * Counts how many times the element has come into view.
 *
 * Used as a React key so the whole animation restarts each time — the ask was
 * for it to play "every time the graph is in view", not once per page load.
 * Returning a count rather than a boolean means a re-entry always produces a new
 * value, so nothing has to be reset first.
 *
 * Returns 0 and never moves when the system asks for reduced motion, so the
 * chart simply exists rather than performing.
 */
function useInViewCount<T extends Element>() {
  const ref = useRef<T>(null);
  const [count, setCount] = useState(0);
  const [still] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || still || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCount((n) => n + 1);
      },
      // A third of the card, so it fires when the chart is genuinely being
      // looked at rather than when one pixel clips the viewport.
      { threshold: 0.33 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  return { ref, playKey: count, still };
}

/** Under this, a river is a couple of blobs and reads as broken rather than
 *  quiet — the placeholder is kinder and more honest. */
const MIN_WEEKS_WITH_DATA = 2;

const SERIES: { key: Area; color: string }[] = [
  { key: "personal", color: "var(--sage)" },
  { key: "professional", color: "var(--brown)" },
  { key: "education", color: "var(--clay)" },
];

/**
 * Deterministic pseudo-random in [0, 1).
 *
 * Seeded from the dot's own coordinates so the scatter is identical on every
 * render. Math.random would reshuffle every dot on each repaint, which turns a
 * calm surface into a fidgeting one — and would make the chart look different
 * every time someone glanced at it.
 */
function scatter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Moment markers, drawn inside the bands.
 *
 * Recharts has no concept of this, so it goes through Customized, which is
 * handed the chart's own computed geometry after layout. Each area item carries
 * `points` (the top edge, per week) and `baseLine` (the bottom edge), which is
 * exactly the vertical extent of that band in that week — so dots can be placed
 * inside it without recomputing the wiggle offset by hand.
 *
 * Density is the message: one dot per thing done. No count is ever drawn, and at
 * high volumes the dots simply read as texture, which is the right level of
 * precision for "how full was that week".
 */
function MomentDots(props: Record<string, unknown> & { still?: boolean }) {
  const items = props.formattedGraphicalItems as
    | { props?: { points?: { x: number; y: number }[]; baseLine?: { x: number; y: number }[] } }[]
    | undefined;
  if (!Array.isArray(items)) return null;

  // The plot rectangle, so jitter cannot push a dot outside the chart. The first
  // and last weeks sit on the edges, and half the scatter for those was landing
  // in the margin — one sample came out at x = -1.
  const offset = props.offset as { left?: number; width?: number } | undefined;
  const minX = offset?.left ?? 0;
  const maxX = minX + (offset?.width ?? 0);

  const dots: React.ReactElement[] = [];

  items.forEach((item, seriesIndex) => {
    const points = item?.props?.points;
    const baseLine = item?.props?.baseLine;
    if (!Array.isArray(points) || !Array.isArray(baseLine)) return;
    const series = SERIES[seriesIndex];
    if (!series) return;

    points.forEach((point, weekIndex) => {
      const base = baseLine[weekIndex];
      if (!base || typeof point?.y !== "number" || typeof base.y !== "number") return;

      const top = Math.min(point.y, base.y);
      const height = Math.abs(base.y - point.y);
      // A band thinner than this has no room to hold a dot without the dot
      // spilling outside it, which would read as a stray mark.
      if (height < 6) return;

      /*
        The count comes from the original row, not from point.value.
        
        In a stacked chart Recharts sets `value` to the [y0, y1] pair rather than
        the datum, so reading it gave an array — and Math.min(array, 12) is NaN,
        which made the loop below run zero times and silently drew nothing.
      */
      const payload = (point as { payload?: Record<string, unknown> }).payload;
      const raw = payload?.[series.key];
      const count = typeof raw === "number" ? raw : 0;
      // Beyond a dozen the dots stop being countable anyway and start being
      // texture, so this caps the work rather than the meaning.
      const shown = Math.min(count, 12);

      for (let i = 0; i < shown; i++) {
        const seed = seriesIndex * 1000 + weekIndex * 37 + i;
        const jitterX = (scatter(seed) - 0.5) * 18;
        const cx = Math.min(maxX - 2, Math.max(minX + 2, point.x + jitterX));
        // Inset so a dot never touches the band's edge.
        const y = top + 4 + scatter(seed + 0.5) * Math.max(1, height - 8);
        /*
          Staggered left to right, a hair apart, so the dots arrive like
          something settling rather than all at once. The delay is driven by the
          week rather than the dot index, so a busy week does not take longer to
          finish than a quiet one — the sweep should read as time passing, not as
          the chart counting things out.
        */
        const delay = props.still ? 0 : 240 + weekIndex * 55 + scatter(seed + 1.5) * 90;
        dots.push(
          <circle
            key={`${seriesIndex}-${weekIndex}-${i}`}
            cx={cx}
            cy={y}
            r={1.6}
            fill="var(--card)"
            style={
              props.still
                ? { fillOpacity: 0.55 }
                : {
                    fillOpacity: 0,
                    animation: `river-dot 520ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms forwards`,
                  }
            }
          />,
        );
      }
    });
  });

  return <g aria-hidden>{dots}</g>;
}

/**
 * One sentence about the shape, built from the data.
 *
 * Every phrase here is descriptive. "Spread evenly" and "quieter than the month
 * before" are facts about a pattern; "behind", "only", "should" and "still not"
 * would be claims about a person, and none of them appear.
 */
function summarise(fullest: Area | null, weeksWithData: number): string {
  if (!fullest) return "Nothing recorded yet this season.";
  const name = AREA_META[fullest].label.toLowerCase();
  if (weeksWithData <= 4) return `Most of what you have logged so far sits in ${name}.`;
  return `Most of your energy lately has gone toward ${name} — steady, and still moving.`;
}

const VERSUS: Record<string, string> = {
  fuller: "A little fuller than the stretch before it.",
  quieter: "A little quieter than the stretch before it.",
  similar: "Much like the stretch before it.",
};

export function RhythmRiver({ state }: { state: AppState }) {
  const data = useMemo(() => rhythmRiver(state, WEEKS), [state]);
  const { ref, playKey, still } = useInViewCount<HTMLDivElement>();
  // Off by default: a comparison is a second thing to think about, and the
  // point of the panel is the shape.
  const [showComparison, setShowComparison] = useState(false);

  const enough = data.weeksWithData >= MIN_WEEKS_WITH_DATA;
  const comparison = VERSUS[data.versusBefore];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Your rhythm</h2>
      </div>

      <div className="card-soft p-4 md:p-5">
        {enough ? (
          <>
            {/*
              Two elements, deliberately. The observed one never remounts; the
              keyed one inside it does.

              With the ref and the key on the same element, the first
              intersection bumped the key, React replaced the node, and the
              observer was left watching a detached one — so it fired exactly
              once and never again. The replay looked like it worked because the
              animation still ran on that first mount.
            */}
            <div ref={ref} className="h-52 @xl:h-64">
              <div
                className="h-full"
                // The wave rises from the middle, which is where a wiggle stack's
                // own baseline sits, so it grows out of its centre rather than up
                // off a floor that is not there.
                style={
                  still
                    ? undefined
                    : {
                        transformOrigin: "50% 50%",
                        animation: "river-wave 900ms cubic-bezier(0.22, 1, 0.36, 1) both",
                      }
                }
                key={playKey}
              >
                <ResponsiveContainer>
                  <AreaChart
                    data={data.weeks as RiverWeek[]}
                    // The whole argument of the component, in one prop.
                    stackOffset="wiggle"
                    margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                  >
                    <defs>
                      {SERIES.map((s) => (
                        <linearGradient
                          key={s.key}
                          id={`river-${s.key}`}
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={s.color} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0.65} />
                        </linearGradient>
                      ))}
                    </defs>

                    {/* Weeks only. No y-axis at all: there is no quantity being
                      asserted, and an axis would invent one. */}
                    <XAxis
                      dataKey="label"
                      fontSize={10}
                      stroke="var(--ink-soft)"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />

                    {SERIES.map((s) => (
                      <RArea
                        key={s.key}
                        type="basis"
                        dataKey={s.key}
                        name={AREA_META[s.key].label}
                        stackId="river"
                        stroke="none"
                        fill={`url(#river-${s.key})`}
                        // Recharts multiplies its own 0.6 default into whatever the
                        // fill carries; 1 leaves the gradient's opacity as chosen.
                        fillOpacity={1}
                        isAnimationActive={false}
                      />
                    ))}

                    <Customized component={MomentDots} still={still} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p className="mt-3 text-sm text-ink">{summarise(data.fullest, data.weeksWithData)}</p>

            {comparison && (
              <div className="mt-1.5">
                {showComparison ? (
                  <p className="text-xs text-ink-soft">{comparison}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowComparison(true)}
                    className="text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
                  >
                    Compare with before
                  </button>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-soft">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {AREA_META[s.key].label}
                </span>
              ))}
              <span className="ml-auto hidden @xl:inline">Each dot is one thing done.</span>
            </div>
          </>
        ) : (
          /* Prose, not an empty chart. A river drawn from three days of data is
             two blobs and a gap, which looks like something went wrong. */
          <p className="py-6 text-center text-sm text-ink-soft">
            Your river starts to show its shape after a couple of weeks. There is nothing to do
            about that &mdash; it fills in on its own as you go.
          </p>
        )}
      </div>
    </section>
  );
}
