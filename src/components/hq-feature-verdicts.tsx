import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { analyseFeatureAdoption, type FeatureVerdict, type UsageFact } from "@/lib/hq-analytics";
import { cn } from "@/lib/utils";

/**
 * What to build next, and what to stop paying for.
 *
 * The charts above this count events, which is the wrong denominator for a
 * build-or-cut decision: one person using the timer forty times draws the same
 * bar as eight people using it five times each, and those two facts call for
 * opposite decisions. So the first column here is how many distinct people
 * touched a feature at all, and volume is demoted to third.
 *
 * Every row carries the sentence behind its verdict, because these get quoted
 * in a meeting weeks later, without the chart, by someone who was not there.
 * A verdict that cannot be read aloud with its reasoning attached is a verdict
 * that will be misused.
 */

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

type SortKey = "adoption" | "uses" | "depth";

const VERDICT_STYLE: Record<FeatureVerdict["verdict"], { label: string; className: string }> = {
  deepen: { label: "Deepen", className: "bg-sage-soft text-[color:var(--sage-deep)]" },
  keep: { label: "Keep", className: "bg-secondary text-ink-soft" },
  niche: { label: "Niche", className: "bg-brown-soft text-[color:var(--brown)]" },
  shallow: { label: "Not holding", className: "bg-clay-soft text-[color:var(--clay)]" },
  cut: { label: "Cut", className: "border border-[color:var(--clay)] text-[color:var(--clay)]" },
  thin: { label: "Too early", className: "border border-dashed border-border text-ink-soft" },
};

export function HqFeatureVerdicts({ events }: { events: UsageFact[] }) {
  const [days, setDays] = useState<number>(30);
  const [sort, setSort] = useState<SortKey>("adoption");
  const [open, setOpen] = useState<string | null>(null);

  const { rows, activeUsers } = useMemo(() => analyseFeatureAdoption(events, days), [events, days]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => b[sort] - a[sort] || b.uses - a.uses);
    return copy;
  }, [rows, sort]);

  const header = (key: SortKey, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      title={hint}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] transition-colors",
        sort === key ? "text-ink" : "text-ink-soft hover:text-ink",
      )}
    >
      {label}
      {sort === key && <ChevronDown className="h-3 w-3" />}
    </button>
  );

  return (
    <section className="card-soft space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-base">What to build next</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {activeUsers === 0
              ? "Nobody was active in this window, so there is nothing to read."
              : `Measured against the ${activeUsers} ${
                  activeUsers === 1 ? "person" : "people"
                } who did anything at all in this window — not against every account, which would score every feature against people who never showed up.`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setDays(w.days)}
              className={cn(
                "chip transition-colors",
                days === w.days
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-ink-soft hover:text-ink",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-3 font-normal">
                <span className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  Feature
                </span>
              </th>
              <th className="pb-2 pr-3 font-normal">
                {header("adoption", "People", "How many distinct people used it")}
              </th>
              <th className="pb-2 pr-3 font-normal">
                {header("depth", "Each", "Uses per person who adopted it — did they come back")}
              </th>
              <th className="pb-2 pr-3 font-normal">
                {header("uses", "Uses", "Total events, which one heavy user can inflate")}
              </th>
              <th className="pb-2 font-normal">
                <span className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  Verdict
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const style = VERDICT_STYLE[row.verdict];
              const isOpen = open === row.label;
              return (
                /* The key belongs on the fragment, not the rows inside it: the
                   fragment is what this map returns, and a key on a child of an
                   unkeyed fragment is a key React never sees. */
                <Fragment key={row.label}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : row.label)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/50"
                  >
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronUp className="h-3 w-3 shrink-0 text-ink-soft" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0 text-ink-soft" />
                        )}
                        {row.label}
                      </span>
                    </td>
                    {/* The bar is the adoption share; the number beside it is the
                        headcount, because a percentage of eleven people needs its
                        numerator visible to be trusted. */}
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-[color:var(--sage)]"
                            style={{ width: `${Math.round(row.adoption * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums text-xs text-ink-soft">
                          {row.users} · {Math.round(row.adoption * 100)}%
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-xs text-ink-soft">
                      {row.users === 0 ? "—" : `${row.depth.toFixed(1)}×`}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-xs text-ink-soft">{row.uses}</td>
                    <td className="py-2.5">
                      <span className={cn("chip whitespace-nowrap", style.className)}>
                        {style.label}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/60">
                      <td colSpan={5} className="pb-3 pr-3 text-xs text-ink-soft">
                        {row.because}
                        {row.lastUsed && (
                          <span className="mt-1 block text-[11px]">
                            Last used {new Date(row.lastUsed).toLocaleDateString()}.
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-soft">
        “Too early” is a real answer and the most common honest one at pilot size — a “cut” drawn
        from four events will be quoted later without its sample size.
      </p>
    </section>
  );
}
