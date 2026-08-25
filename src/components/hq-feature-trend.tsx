import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  analyseFeatureTrend,
  MAX_DISPLAY_PCT,
  THIN_EVIDENCE,
  type TrendRow,
  type UsageFact,
} from "@/lib/hq-analytics";

/**
 * Which features grew and which were abandoned, for the Month 3 "cut what nobody
 * used, deepen what everybody used" call.
 *
 * Bars diverge from zero: right means a feature held or grew its use over the
 * pilot, left means it fell away after people first tried it.
 *
 * The measurement, which is the whole point:
 *
 * Uses per active person per period — NOT raw event counts. The pilot onboards
 * in waves (3, then 5, then 10, 10, 10), so raw counts rise for every feature in
 * the second half simply because there are more people in the room. A chart built
 * on counts would show everything growing and answer nothing. Dividing by the
 * people actually active in each period asks the real question: did the average
 * tester reach for this more, or less?
 *
 * Two cases deliberately kept out of the bars rather than forced onto the axis:
 *
 * - Untouched in the first half, used in the second. That is a percentage change
 *   from zero. Rendering it as +1000% would dwarf every real bar and mean
 *   nothing, so it is listed separately as "new".
 * - Never used at all. A 0% bar reads as "flat", which is the wrong conclusion
 *   entirely — "nobody has ever opened this" is the single most decision-relevant
 *   state a feature can be in, so it gets its own list.
 *
 * Anything resting on a handful of events is marked thin rather than silently
 * charted, because at this sample size two taps is a 100% swing.
 */

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrendRow }[];
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const dir = r.trueChange >= 0 ? "up" : "down";
  return (
    <div
      className="rounded-xl border border-border p-3 text-xs"
      style={{ background: "var(--card)" }}
    >
      <div className="font-medium text-ink">{r.label}</div>
      <div className="mt-1 text-ink-soft">
        {dir} {Math.abs(Math.round(r.trueChange))}% per active person
      </div>
      <div className="text-ink-soft">
        {r.earlyRate.toFixed(2)} → {r.lateRate.toFixed(2)} uses each
      </div>
      <div className="text-ink-soft">{r.total} uses in total</div>
      {r.thin && (
        <div className="mt-1" style={{ color: "var(--clay)" }}>
          Thin evidence — under {THIN_EVIDENCE} uses.
        </div>
      )}
    </div>
  );
}

export function FeatureTrendChart({
  events,
  loading,
  windowDays,
  truncated,
}: {
  events?: UsageFact[];
  loading: boolean;
  windowDays: number;
  truncated?: boolean;
}) {
  const { bars, brandNew, untouched, peopleEarly, peopleLate } = useMemo(
    () =>
      events
        ? analyseFeatureTrend(events, windowDays)
        : { bars: [], brandNew: [], untouched: [], peopleEarly: 0, peopleLate: 0 },
    [events, windowDays],
  );

  const nothingYet = bars.length === 0 && brandNew.length === 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Feature trend</h2>
        <span className="text-xs text-ink-soft">
          Second half vs first half of {windowDays} days, per active person
        </span>
      </div>

      {loading ? (
        <div className="card-soft h-72 animate-pulse rounded-2xl bg-secondary/60" />
      ) : (
        <div className="card-soft p-4 md:p-6">
          {truncated && (
            <p className="mb-3 text-xs" style={{ color: "var(--clay)" }}>
              The activity query hit its row limit, so the earlier half is under-counted and these
              trends will read too positive.
            </p>
          )}

          {nothingYet ? (
            <p className="py-8 text-center text-sm text-ink-soft">
              No feature use recorded yet. Bars appear once a feature has been used in both halves
              of the window, so there is something to compare.
            </p>
          ) : (
            <>
              {bars.length > 0 && (
                <div style={{ height: Math.max(200, bars.length * 34 + 64) }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={bars}
                      layout="vertical"
                      margin={{ left: 24, right: 16, bottom: 18 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        domain={[-MAX_DISPLAY_PCT, MAX_DISPLAY_PCT]}
                        fontSize={10}
                        stroke="var(--ink-soft)"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                        // Names the comparison on the chart itself. Without it a
                        // reader has to trust that "%" means what they assume,
                        // and the assumption is usually raw usage.
                        label={{
                          value: "% change in use per active person, first half to second half",
                          position: "insideBottom",
                          offset: -4,
                          fill: "var(--ink-soft)",
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        fontSize={11}
                        stroke="var(--ink-soft)"
                        width={82}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={<TrendTooltip />}
                        // Recharts' default hover cursor is a hard #ccc block,
                        // which is the one grey left on an otherwise warm page.
                        cursor={{ fill: "var(--secondary)", fillOpacity: 0.5 }}
                      />
                      {/* The zero axis the bars diverge from. */}
                      <ReferenceLine x={0} stroke="var(--ink-soft)" strokeWidth={1} />
                      <Bar dataKey="change" radius={4}>
                        {bars.map((r) => (
                          <Cell
                            key={r.label}
                            // Sage for held or growing, clay for falling away —
                            // the same two roles these tokens carry elsewhere.
                            fill={r.change >= 0 ? "var(--sage)" : "var(--clay)"}
                            // Thin evidence reads as provisional rather than
                            // being hidden or presented as fact.
                            fillOpacity={r.thin ? 0.4 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {(brandNew.length > 0 || untouched.length > 0) && (
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
                  {brandNew.length > 0 && (
                    <p className="text-ink-soft">
                      <span className="text-ink">New this period:</span>{" "}
                      {brandNew.map((b) => `${b.label} (${b.uses})`).join(", ")} — no earlier use to
                      compare against, so no bar yet.
                    </p>
                  )}
                  {untouched.length > 0 && (
                    <p className="text-ink-soft">
                      <span style={{ color: "var(--clay)" }}>Never used:</span>{" "}
                      {untouched.join(", ")}. Not a flat bar — no one has touched these at all.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-3 text-[11px] text-ink-soft">
                Rates are per person active in each half ({peopleEarly} early, {peopleLate} late),
                so a bar is not just the pilot growing. Faded bars rest on under {THIN_EVIDENCE}{" "}
                uses. Bars clamp at ±{MAX_DISPLAY_PCT}%; hover for the real figure.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
