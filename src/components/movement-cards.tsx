import { useMemo } from "react";

import { AREA_META } from "@/lib/store";
import type { AppState } from "@/lib/store-types";
import { areaMovement, MOVEMENT_WORDS, type AreaMovement } from "@/lib/user-insights";

/**
 * One card per area, showing movement as a line and a sentence.
 *
 * The alternative this replaces is the percentage ring, and the problem with a
 * ring is not that it is ugly — it is that a percentage implies a whole. "40%"
 * silently asserts that 100% exists and that you are 60% short of it, which is a
 * verdict dressed up as a readout. For areas of a life there is no denominator,
 * so there should be no percentage.
 *
 * What is left is a shape and a plain sentence. The shape is unlabelled on
 * purpose: no axis, no peak marker, no numbers. It answers "roughly how has this
 * been going" and refuses to answer "by how much", because the second question
 * is the one that turns a life into a scoreboard.
 *
 * The sentences are descriptive and never evaluative — "Quieter lately" is a
 * fact about a stretch of weeks; "Falling behind" would be a claim about a
 * person. They live in one map in user-insights so the tone cannot drift as
 * someone adds a case.
 */

/** A smooth path through the points, normalised to the box. Drawn as a shape
 *  under a line, so a flat stretch still reads as present rather than as a
 *  chart that failed to load. */
function sparkPath(points: number[], w: number, h: number, pad = 2) {
  if (points.length === 0) return { line: "", fill: "" };
  const max = Math.max(1, ...points);
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);

  const coords = points.map((v, i) => [pad + i * stepX, y(v)] as const);
  // Catmull-Rom-ish smoothing via midpoints: gentler than straight segments,
  // and it avoids the spikiness that would make an ordinary week look dramatic.
  let line = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [px, py] = coords[i - 1];
    const [cx, cy] = coords[i];
    const mx = (px + cx) / 2;
    line += ` Q ${px} ${py} ${mx} ${(py + cy) / 2} T ${cx} ${cy}`;
  }
  const fill = `${line} L ${coords[coords.length - 1][0]} ${h} L ${coords[0][0]} ${h} Z`;
  return { line, fill };
}

function MovementCard({ m }: { m: AreaMovement }) {
  const meta = AREA_META[m.area];
  const color =
    m.area === "personal"
      ? "var(--sage)"
      : m.area === "professional"
        ? "var(--brown)"
        : "var(--clay)";
  const { line, fill } = sparkPath(m.points, 120, 40);
  const empty = m.movement === "none";

  return (
    <div className="card-soft density-p flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <meta.icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
        <span className="text-sm font-medium">{meta.label}</span>
      </div>

      <div className="h-10" aria-hidden>
        {!empty && (
          <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="h-full w-full">
            <path d={fill} fill={color} fillOpacity={0.16} />
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={1.75}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      <p className="text-xs text-ink-soft">{MOVEMENT_WORDS[m.movement]}</p>
    </div>
  );
}

const WEEKS = 10;

export function MovementCards({ state }: { state: AppState }) {
  const movements = useMemo(() => areaMovement(state, WEEKS), [state]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">How it&rsquo;s been going</h2>
      </div>

      {/* Three across when the widget is wide enough to read them, stacked when
          it is not — the same threshold the area progress row uses. */}
      <div className="grid gap-3 @xl:grid-cols-3">
        {movements.map((m) => (
          <MovementCard key={m.area} m={m} />
        ))}
      </div>
    </section>
  );
}
