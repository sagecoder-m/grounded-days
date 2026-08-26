import { useMemo } from "react";
import { Area as RArea, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { weeklyAreaBalance, type BalanceWeek } from "@/lib/user-insights";
import type { AppState } from "@/lib/store-types";

/**
 * How attention has spread across the three areas, week by week.
 *
 * A streamgraph rather than a stacked bar or a line: it has no baseline. Nothing
 * sits on a floor it could fall below and nothing climbs toward a ceiling, so
 * the only thing the shape can say is "more of this lately, less of that" —
 * which is the whole and only point. A stacked bar with a y-axis would
 * immediately invite "is that a good number", and there is no good number here.
 *
 * Deliberately not called time. Only timed events carry a duration and focus
 * sessions carry minutes but no area, so any "hours per area" figure would be
 * mostly invention. This counts things attended to, and says so on the panel —
 * a smaller true statement beats a bigger false one.
 *
 * No y-axis, no gridlines, no totals. Weeks along the bottom, and that is all.
 */

const WEEKS = 10;

const SERIES = [
  { key: "personal", label: "Personal", color: "var(--sage)" },
  { key: "professional", label: "Professional", color: "var(--brown)" },
  { key: "education", label: "Education", color: "var(--clay)" },
] as const;

function BalanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((n, p) => n + (p.value ?? 0), 0);
  return (
    <div
      className="rounded-xl border border-border p-3 text-xs"
      style={{ background: "var(--card)" }}
    >
      <div className="font-medium text-ink">Week of {label}</div>
      {total === 0 ? (
        <div className="mt-1 text-ink-soft">A quiet week.</div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {payload
            .filter((p) => p.value > 0)
            .map((p) => (
              <div key={p.name} className="flex items-center gap-1.5 text-ink-soft">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}: {p.value === 1 ? "one thing" : `${p.value} things`}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function AreaBalance({ state }: { state: AppState }) {
  const data: BalanceWeek[] = useMemo(() => weeklyAreaBalance(state, WEEKS), [state]);
  const anything = data.some((w) => w.personal + w.professional + w.education > 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Where your attention went</h2>
        <span className="text-xs italic text-ink-soft">No target, just the shape</span>
      </div>

      <div className="card-soft p-4 md:p-5">
        {anything ? (
          <>
            <div className="h-44 @xl:h-52">
              <ResponsiveContainer>
                {/*
                  silhouette is what makes this a streamgraph rather than a
                  stacked area: the stack is centred on its own midline instead of
                  resting on zero, so there is no baseline to be above or below.
                */}
                <AreaChart
                  data={data}
                  stackOffset="silhouette"
                  margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                >
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient
                        key={s.key}
                        id={`balance-${s.key}`}
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    stroke="var(--ink-soft)"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <Tooltip content={<BalanceTooltip />} cursor={false} />
                  {SERIES.map((s) => (
                    <RArea
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stackId="1"
                      stroke={s.color}
                      strokeWidth={1}
                      fill={`url(#balance-${s.key})`}
                      /*
                        Recharts defaults an Area's fillOpacity to 0.6 and
                        multiplies it by whatever the fill already carries, so the
                        gradient's own 0.85 and 0.55 were arriving as 0.51 and
                        0.33 — half the intended weight, which is what made the
                        bands wash out against cream. 1 here hands control back to
                        the gradient, where the opacity was chosen.
                      */
                      fillOpacity={1}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-soft">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
              ))}
              {/* Names the unit honestly. */}
              <span className="ml-auto hidden @xl:inline">Things attended to, by week.</span>
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-ink-soft">
            Nothing to spread out yet. This fills in as you finish things across your areas.
          </p>
        )}
      </div>
    </section>
  );
}
