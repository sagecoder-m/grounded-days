import { useMemo } from "react";
import { format, parseISO } from "date-fns";

import { SoftProgress } from "@/components/soft-progress";
import { AREA_LABEL, summarise, type AreaStanding } from "@/lib/share-summary";
import type { SharedView } from "@/lib/share";
import type { Area } from "@/lib/store-types";

const AREA_VAR: Record<Area, string> = {
  personal: "var(--sage)",
  professional: "var(--brown)",
  education: "var(--clay)",
};

const AREA_TINT: Record<Area, "sage" | "brown" | "clay"> = {
  personal: "sage",
  professional: "brown",
  education: "clay",
};

/**
 * What a shared link shows about how someone has been.
 *
 * The page this replaces listed three things: goals with progress bars, every
 * upcoming task and event, and a row of habit names. All accurate, and the
 * wrong shape for who opens it. A therapist handed a link does not want a
 * fortnight's to-do list — they want to know how the last couple of months
 * have gone and where a question might help. They were being given the raw
 * material and asked to do the reading themselves.
 *
 * So the order is inverted. Sentences first, then the shape of the weeks, then
 * the areas, and the lists last where someone can look if they want detail.
 *
 * Written to be safe to open in front of the person it describes, which is the
 * constraint everything else follows from — see share-summary.ts for the
 * vocabulary rules, which are tested. No red, no percentages of days, no
 * absence counted anywhere on this page.
 */
export function ShareSummaryView({ data, today }: { data: SharedView; today: string }) {
  /*
    Whether this link's data can support a summary at all.

    A link opened against a share function that has not been redeployed yet
    returns the old payload, with no history in it. Summarising that would
    report an eight-week picture built from nothing — "nothing finished in the
    last week" to someone whose account is perfectly healthy, which is both
    wrong and exactly the kind of sentence this page must never produce. So the
    summary is skipped and the link shows what it always showed.
  */
  const hasHistory = data.since !== undefined && data.completions !== undefined;

  const summary = useMemo(
    () =>
      summarise({
        since: data.since ?? today,
        today,
        areas: data.areas,
        completions: data.completions ?? [],
        openWork: data.openWork ?? [],
        goals: data.goals.map((g) => ({ area: g.area, progress: g.progress })),
        habitCheckins: data.habitCheckins ?? [],
      }),
    [data, today],
  );

  const peak = Math.max(1, ...summary.weeks.map((w) => w.total));

  return (
    <div className="space-y-10">
      {/* The reading, in sentences. First because it is the only part that does
          not need interpreting, and the part a busy person will actually read. */}
      {hasHistory && (
        <section className="card-soft p-5 md:p-6">
          <div className="space-y-2.5">
            {summary.sentences.map((line) => (
              <p key={line} className="text-[15px] leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* The run of weeks. A shape, not a score — no axis of "expected", so
          there is no line to fall short of. */}
      {hasHistory && summary.weeks.length > 1 && !summary.empty && (
        <section>
          <h2 className="font-serif text-xl">The last few weeks</h2>
          <p className="mt-1 mb-4 text-sm text-ink-soft">
            How much was finished each week, and in which part of life. Quiet weeks are kept in —
            they are part of the picture.
          </p>
          <div
            className="flex items-end gap-1.5 overflow-x-auto pb-1"
            role="img"
            aria-label={`Weekly activity across ${summary.weeks.length} weeks`}
          >
            {summary.weeks.map((week) => (
              <div
                key={week.weekStart}
                className="flex min-w-6 flex-1 flex-col items-center gap-1.5"
              >
                {/* Stacked, so a week reads as one amount split between areas
                    rather than three competing bars. */}
                <div
                  className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-md bg-secondary/60"
                  style={{ height: "5.5rem" }}
                  title={`Week of ${format(parseISO(week.weekStart), "d MMM")}: ${week.total} finished`}
                >
                  {(["personal", "professional", "education"] as Area[]).map((area) =>
                    week.byArea[area] > 0 ? (
                      <div
                        key={area}
                        style={{
                          height: `${(week.byArea[area] / peak) * 100}%`,
                          backgroundColor: AREA_VAR[area],
                        }}
                      />
                    ) : null,
                  )}
                </div>
                <span className="text-[10px] tabular-nums text-ink-soft">
                  {format(parseISO(week.weekStart), "d/M")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* One card per area. Finished and waiting side by side, because the pair
          is the actual information — six waiting means something different
          beside twenty finished than beside none. */}
      {hasHistory && !summary.empty && (
        <section>
          <h2 className="font-serif text-xl">Where things stand</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary.standings.map((standing) => (
              <AreaCard
                key={standing.area}
                standing={standing}
                attention={summary.needsSupport[0] === standing.area}
              />
            ))}
          </div>
        </section>
      )}

      {data.goals.length > 0 && (
        <section>
          <h2 className="font-serif text-xl">Goals</h2>
          <div className="mt-4 space-y-3">
            {data.goals.map((goal) => (
              <div key={goal.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{goal.name}</span>
                  <span className="text-xs text-ink-soft">
                    {AREA_LABEL[goal.area as Area]} · {goal.progress}%
                  </span>
                </div>
                <SoftProgress value={goal.progress} tint={AREA_TINT[goal.area as Area]} />
              </div>
            ))}
          </div>
        </section>
      )}

      {data.habits.length > 0 && (
        <section>
          <h2 className="font-serif text-xl">Daily habits</h2>
          <p className="mt-1 mb-3 text-sm text-ink-soft">
            {hasHistory && summary.habitDays > 0
              ? `Tended on ${summary.habitDays} of the last ${summary.windowDays} days.`
              : "What is being tended to, day to day."}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.habits.map((habit) => (
              <span key={habit.id} className="chip bg-sage-soft text-sage-deep">
                {habit.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One area, as a card.
 *
 * `attention` marks the area with the most work waiting. It is drawn as a soft
 * ring in that area's own colour and labelled "worth asking about" — not a
 * warning colour and not an alert. The distinction matters: this card may be
 * read by the person it describes, and a red badge on their hardest month is
 * the exact experience this app exists to avoid.
 */
function AreaCard({ standing, attention }: { standing: AreaStanding; attention: boolean }) {
  const { area, done, waiting, open, goals, goalProgress } = standing;
  return (
    <div
      className={`rounded-2xl border bg-card p-4 ${
        attention ? "border-transparent ring-1 ring-[color:var(--tan)]" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: AREA_VAR[area] }}
          />
          {AREA_LABEL[area]}
        </span>
        {attention && (
          <span className="chip bg-secondary text-[11px] text-ink-soft">worth asking about</span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-5">
        <span>
          <span className="font-serif text-2xl tabular-nums">{done}</span>
          <span className="ml-1.5 text-xs text-ink-soft"> finished</span>
        </span>
        {open > 0 && (
          <span>
            <span className="font-serif text-2xl tabular-nums">{waiting}</span>
            {/* "Waiting", never "overdue". The work is waiting; the person is
                not failing. */}
            <span className="ml-1.5 text-xs text-ink-soft"> waiting</span>
          </span>
        )}
      </div>

      {goals > 0 && goalProgress !== null && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] text-ink-soft">
            {goals} {goals === 1 ? "goal" : "goals"} · {goalProgress}% along
          </p>
          <SoftProgress value={goalProgress} tint={AREA_TINT[area]} />
        </div>
      )}
    </div>
  );
}
