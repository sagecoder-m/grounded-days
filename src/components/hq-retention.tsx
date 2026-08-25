import { useMemo } from "react";

import { buildCohorts, type RetentionAccount, type UsageFact } from "@/lib/hq-analytics";

/**
 * Cohort retention for the pilot: signup week down, weeks since signup across.
 *
 * The question this exists to answer is "does the product retain people", which
 * a total-usage chart cannot answer — usage climbs simply because testers keep
 * being added. Splitting by signup week separates "more people" from "the same
 * people came back".
 *
 * Not a Recharts chart. Recharts has no heatmap primitive, and a grid of divs is
 * both less code and more legible than bending a scatter plot into a table. No
 * new dependency either way.
 *
 * Three decisions that matter more than the rendering:
 *
 * 1. "Active" means a deliberate action — any event except page_view. A cohort
 *    that opened the tab and did nothing is not retained, and counting page
 *    views would let the grid look healthy while the product went unused.
 *
 * 2. A week that has not happened yet is blank, never 0%. A cohort that signed
 *    up nine days ago has no week-3 cell, and printing 0% there would read as
 *    "they all left" instead of "we do not know yet". This is the single easiest
 *    way for a retention grid to lie.
 *
 * 3. Every row shows its size. At pilot scale a cohort is 3-10 people, so one
 *    person is 10-33 percentage points. A bare "67%" invites conclusions the
 *    sample cannot support; "67% · 2 of 3" does not.
 */

/**
 * Cell background, walking the app's own sage from near-nothing to full.
 *
 * color-mix against --card rather than a hand-written ramp, so the scale is
 * derived from the existing tokens and follows the theme (including dark mode
 * and the [data-accent] variants) instead of freezing one palette in place.
 */
function cellStyle(pct: number) {
  const weight = Math.round(pct);
  return {
    backgroundColor: `color-mix(in oklab, var(--sage) ${weight}%, var(--card))`,
    // Sage is dark at full strength, so the label has to flip or it disappears
    // into its own cell.
    color: weight >= 55 ? "var(--primary-foreground)" : "var(--ink-soft)",
  };
}

export function RetentionHeatmap({
  accounts,
  events,
  loading,
  truncated,
}: {
  accounts?: RetentionAccount[];
  events?: UsageFact[];
  loading: boolean;
  /** The event query hit its row cap, so weeks may be under-counted. */
  truncated?: boolean;
}) {
  const { cohorts, columns } = useMemo(
    () => (accounts && events ? buildCohorts(accounts, events) : { cohorts: [], columns: 1 }),
    [accounts, events],
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Retention by cohort</h2>
        <span className="text-xs text-ink-soft">Signup week down, weeks since signup across</span>
      </div>

      {loading ? (
        <div className="card-soft h-64 animate-pulse rounded-2xl bg-secondary/60" />
      ) : cohorts.length === 0 ? (
        <div className="card-soft p-6 text-center">
          <p className="text-sm text-ink-soft">
            No cohorts yet. A cohort appears once an account exists; its first column fills in as
            soon as that person does something.
          </p>
        </div>
      ) : (
        <div className="card-soft p-4 md:p-6">
          {truncated && (
            <p className="mb-3 text-xs" style={{ color: "var(--clay)" }}>
              The activity query hit its row limit, so later weeks may be under-counted. Narrow the
              window before reading this closely.
            </p>
          )}

          {/* Scrolls on its own rather than pushing the page sideways. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[color:var(--card)] pr-2 text-left font-normal text-ink-soft">
                    Cohort
                  </th>
                  {Array.from({ length: columns }, (_, i) => (
                    <th key={i} className="min-w-9 px-1 pb-1 text-center font-normal text-ink-soft">
                      {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.weekStart.toISOString()}>
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-[color:var(--card)] pr-2 text-left font-normal">
                      <span className="text-ink">{c.label}</span>
                      {/* The denominator, always. One person is 10-33 points at
                          this scale. */}
                      <span className="ml-1.5 text-ink-soft">n={c.size}</span>
                    </th>
                    {c.cells.slice(0, columns).map((cell, i) =>
                      cell.pct === null ? (
                        <td
                          key={i}
                          className="rounded-md border border-dashed border-border"
                          aria-label="Not yet"
                        />
                      ) : (
                        <td
                          key={i}
                          className="rounded-md px-1 py-1.5 text-center tabular-nums"
                          style={cellStyle(cell.pct)}
                          title={`${c.label} cohort, week ${i}: ${cell.active} of ${c.size} active`}
                        >
                          {Math.round(cell.pct)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              % of the cohort active that week
              <span className="flex overflow-hidden rounded">
                {[0, 25, 50, 75, 100].map((p) => (
                  <span
                    key={p}
                    className="h-3 w-4"
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--sage) ${p}%, var(--card))`,
                    }}
                  />
                ))}
              </span>
              0 to 100
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 rounded border border-dashed border-border" />
              week not reached yet
            </span>
            <span>Active = any deliberate action, not just opening the app.</span>
          </div>
        </div>
      )}
    </section>
  );
}
