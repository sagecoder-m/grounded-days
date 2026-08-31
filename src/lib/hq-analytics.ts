/**
 * The arithmetic behind the two HQ pilot charts, kept apart from the components
 * that draw them.
 *
 * Here rather than in the component files because this is where the charts can
 * actually be wrong. A heatmap that renders beautifully while counting a week
 * that has not happened yet, or a trend that mistakes "more testers" for "more
 * usage", is worse than no chart — it produces confident decisions from bad
 * numbers. Pure functions over plain arrays can be tested directly against those
 * exact cases, which is not true of anything holding JSX.
 */
import { addWeeks, differenceInCalendarWeeks, format, startOfWeek } from "date-fns";

export interface RetentionAccount {
  id: string;
  createdAt: string;
}

export interface UsageFact {
  user_id: string;
  event: string;
  created_at: string;
}

/**
 * One week in which a person created something, recovered from their own rows
 * rather than from telemetry — see the admin_activity_weeks migration.
 *
 * week_start is a local calendar date string (YYYY-MM-DD), deliberately not a
 * Date or a timestamp: new Date("2026-07-06") parses as UTC midnight, which is
 * the previous day west of Greenwich and therefore the previous *week* once
 * bucketed. Parsed by component below.
 */
export interface ActivityWeek {
  user_id: string;
  week_start: string;
}

/** Parses YYYY-MM-DD as a local date, never via Date's UTC string path. */
function localDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * One cell of the retention grid.
 *
 * A discriminated union rather than a nullable percentage, so the compiler will
 * not let a caller read pct without first establishing that the week was
 * actually measured. The three states are the point of the chart as much as the
 * numbers are:
 *
 * "measured"   — the week happened and we were recording. pct means something.
 * "future"     — the week has not arrived for this cohort.
 * "unmeasured" — the week finished before telemetry existed, so nobody could
 *                have been recorded active in it. Printing 0% there says "they
 *                all churned" about a week we were not watching, which is the
 *                same lie as printing 0% for next week.
 */
export type Cell =
  | { state: "measured"; pct: number; active: number }
  | { state: "future"; pct: null; active: 0 }
  | { state: "unmeasured"; pct: null; active: 0 };

export interface Cohort {
  weekStart: Date;
  label: string;
  size: number;
  cells: Cell[];
}

export interface TrendRow {
  label: string;
  /** Clamped for the axis. */
  change: number;
  trueChange: number;
  earlyRate: number;
  lateRate: number;
  total: number;
  thin: boolean;
}

/** Monday. Fixed rather than following the viewer's own weekStartsOn setting,
 *  so two admins comparing notes are looking at the same grid. */
const WEEK_OPTS = { weekStartsOn: 1 } as const;

/** Columns to render. Twelve weeks is a quarter, which is the pilot; beyond that
 *  the grid stops fitting and the tail is too thin to read anyway. */
export const MAX_WEEKS = 12;

export function buildCohorts(
  accounts: RetentionAccount[],
  events: UsageFact[],
  /**
   * Pre-telemetry activity, recovered from the rows people created.
   *
   * Folded into the same set of active weeks rather than kept apart, because a
   * week is either one in which somebody did something or it is not — the
   * evidence for it does not change the answer. Set membership also makes this
   * immune to double counting where the two sources overlap, which is exactly
   * why the feature-trend chart does NOT take this input: that one counts, and
   * counting a task twice (once as a row, once as a usage_event) would inflate
   * the recent half of every comparison.
   */
  backfill: ActivityWeek[] = [],
) {
  const now = new Date();
  const thisWeek = startOfWeek(now, WEEK_OPTS);

  /**
   * When the record begins — the earliest event we hold.
   *
   * Derived from the data rather than hardcoded to the migration date, so it
   * stays correct as old rows age out of the query window and needs no upkeep.
   * Signup dates come from auth and reach back further than telemetry does, so
   * without this a cohort that joined before instrumentation shows a wall of 0%
   * that reads as total churn.
   */
  const earliestEvent = events.reduce<number | null>((min, e) => {
    const t = new Date(e.created_at).getTime();
    if (Number.isNaN(t)) return min;
    return min === null || t < min ? t : min;
  }, null);
  const earliestBackfill = backfill.reduce<number | null>((min, b) => {
    const d = localDate(b.week_start);
    if (!d) return min;
    const t = d.getTime();
    return min === null || t < min ? t : min;
  }, null);
  const firstRecordAt =
    earliestEvent === null
      ? earliestBackfill
      : earliestBackfill === null
        ? earliestEvent
        : Math.min(earliestEvent, earliestBackfill);

  /** user -> the set of week offsets in which they did something deliberate. */
  const activeWeeks = new Map<string, Set<number>>();
  const signupWeek = new Map<string, Date>();

  for (const a of accounts) {
    signupWeek.set(a.id, startOfWeek(new Date(a.createdAt), WEEK_OPTS));
  }

  for (const e of events) {
    // Deliberate actions only — see the note above.
    if (e.event === "page_view") continue;
    const cohortStart = signupWeek.get(e.user_id);
    // An event from someone not in the account list (deleted account, or a
    // window that reaches further back than the list) has no cohort to belong
    // to. Dropping it is right: it would otherwise inflate a cohort it is not
    // part of.
    if (!cohortStart) continue;
    const offset = differenceInCalendarWeeks(
      startOfWeek(new Date(e.created_at), WEEK_OPTS),
      cohortStart,
      WEEK_OPTS,
    );
    if (offset < 0 || offset >= MAX_WEEKS) continue;
    let set = activeWeeks.get(e.user_id);
    if (!set) activeWeeks.set(e.user_id, (set = new Set()));
    set.add(offset);
  }

  for (const b of backfill) {
    const cohortStart = signupWeek.get(b.user_id);
    if (!cohortStart) continue;
    const week = localDate(b.week_start);
    if (!week) continue;
    const offset = differenceInCalendarWeeks(startOfWeek(week, WEEK_OPTS), cohortStart, WEEK_OPTS);
    if (offset < 0 || offset >= MAX_WEEKS) continue;
    let set = activeWeeks.get(b.user_id);
    if (!set) activeWeeks.set(b.user_id, (set = new Set()));
    set.add(offset);
  }

  const byWeek = new Map<number, RetentionAccount[]>();
  for (const a of accounts) {
    const key = signupWeek.get(a.id)!.getTime();
    const list = byWeek.get(key);
    if (list) list.push(a);
    else byWeek.set(key, [a]);
  }

  const cohorts: Cohort[] = [...byWeek.entries()]
    // Oldest first, so reading down the grid is reading forward through the pilot.
    .sort((a, b) => a[0] - b[0])
    .map(([time, members]) => {
      const weekStart = new Date(time);
      // How many weeks of this cohort's life have actually begun.
      const elapsed = differenceInCalendarWeeks(thisWeek, weekStart, WEEK_OPTS) + 1;
      const cells: Cell[] = [];
      for (let offset = 0; offset < MAX_WEEKS; offset++) {
        if (offset >= elapsed) {
          cells.push({ pct: null, active: 0, state: "future" });
          continue;
        }
        // The week ran its course before anything was being recorded, so a zero
        // here would be an absence of measurement, not an absence of people.
        const weekEnd = addWeeks(weekStart, offset + 1).getTime();
        if (firstRecordAt === null || weekEnd <= firstRecordAt) {
          cells.push({ pct: null, active: 0, state: "unmeasured" });
          continue;
        }
        const active = members.filter((m) => activeWeeks.get(m.id)?.has(offset)).length;
        cells.push({ pct: (active / members.length) * 100, active, state: "measured" });
      }
      return {
        weekStart,
        label: format(weekStart, "MMM d"),
        size: members.length,
        cells,
      };
    });

  // Counts anything that is not "future": an unmeasured week is part of the
  // pilot's history and has to stay visible, or the gap it represents is hidden
  // rather than shown.
  const widest = cohorts.reduce((max, c) => {
    const last = c.cells.reduce((n, cell, i) => (cell.state === "future" ? n : i + 1), 0);
    return Math.max(max, last);
  }, 1);

  return { cohorts, columns: Math.min(widest, MAX_WEEKS) };
}

/**
 * Feature -> the events that count as using it.
 *
 * Grouped by feature rather than charted per event, because the decision is made
 * per feature: "cut the journal" is a real option, "cut journal_entry_add" is
 * not. page_view is excluded throughout — visiting a section is not using it.
 */
export const FEATURES: { label: string; events: string[] }[] = [
  { label: "Calendar", events: ["event_add", "event_move"] },
  { label: "Habits", events: ["habit_add", "habit_toggle"] },
  { label: "Tasks", events: ["task_add", "task_toggle"] },
  { label: "Journal", events: ["journal_entry_add"] },
  { label: "Goals", events: ["goal_add"] },
  { label: "Courses", events: ["course_add"] },
  { label: "Assistant", events: ["assistant_message"] },
  { label: "Focus timer", events: ["focus_session"] },
  { label: "Sharing", events: ["share_link_create", "share_link_copy"] },
];

/** Below this many events across the whole window, a percentage swing is noise.
 *  Two taps either way would move a 3-event feature by 66 points. */
export const THIN_EVIDENCE = 6;

/** Bars are clamped for readability; the tooltip always carries the true figure. */
export const MAX_DISPLAY_PCT = 200;

export function analyseFeatureTrend(events: UsageFact[], windowDays: number) {
  const now = Date.now();
  const windowMs = windowDays * 86_400_000;
  const midpoint = now - windowMs / 2;

  const eventToFeature = new Map<string, string>();
  for (const f of FEATURES) for (const e of f.events) eventToFeature.set(e, f.label);

  const counts = new Map<string, { early: number; late: number }>();
  // Active people per half, so each half is normalised by its own population.
  const peopleEarly = new Set<string>();
  const peopleLate = new Set<string>();

  for (const e of events) {
    if (e.event === "page_view") continue;
    const at = new Date(e.created_at).getTime();
    if (Number.isNaN(at) || at < now - windowMs) continue;
    const isLate = at >= midpoint;
    (isLate ? peopleLate : peopleEarly).add(e.user_id);

    const feature = eventToFeature.get(e.event);
    if (!feature) continue;
    let c = counts.get(feature);
    if (!c) counts.set(feature, (c = { early: 0, late: 0 }));
    if (isLate) c.late++;
    else c.early++;
  }

  const bars: TrendRow[] = [];
  const brandNew: { label: string; uses: number }[] = [];
  const untouched: string[] = [];

  for (const f of FEATURES) {
    const c = counts.get(f.label) ?? { early: 0, late: 0 };
    const total = c.early + c.late;
    if (total === 0) {
      untouched.push(f.label);
      continue;
    }
    // Per active person, not per event — see the note at the top.
    const earlyRate = peopleEarly.size ? c.early / peopleEarly.size : 0;
    const lateRate = peopleLate.size ? c.late / peopleLate.size : 0;

    if (earlyRate === 0) {
      brandNew.push({ label: f.label, uses: c.late });
      continue;
    }

    const trueChange = ((lateRate - earlyRate) / earlyRate) * 100;
    bars.push({
      label: f.label,
      change: Math.max(-MAX_DISPLAY_PCT, Math.min(MAX_DISPLAY_PCT, trueChange)),
      trueChange,
      earlyRate,
      lateRate,
      total,
      thin: total < THIN_EVIDENCE,
    });
  }

  // Steepest decline at the top, strongest growth at the bottom.
  //
  // Ordered for the "cut what nobody used" half of the Month 3 decision, which is
  // the harder and more consequential half — you read down from the things to
  // question into the things to keep, rather than having to hunt for the bottom
  // of the list.
  bars.sort((a, b) => a.change - b.change);
  return {
    bars,
    brandNew,
    untouched,
    peopleEarly: peopleEarly.size,
    peopleLate: peopleLate.size,
  };
}

// --------------------------------------------------------- feature verdicts

/**
 * What a feature is actually worth keeping, per feature.
 *
 * The existing charts count events, and event counts answer the wrong question
 * for a build-or-cut decision: one person using the timer forty times looks
 * exactly like eight people using it five times each, and those call for
 * opposite decisions. So the first-class number here is how many distinct
 * people touched a feature at all, with volume demoted to a second column.
 */
export interface FeatureVerdict {
  label: string;
  /** Distinct people who used it in the window. */
  users: number;
  /** Those people as a share of everyone active in the window, 0..1. */
  adoption: number;
  /** Total uses, which is the number that flatters a feature one person loves. */
  uses: number;
  /** Uses per person who adopted it — whether they came back to it. */
  depth: number;
  /** ISO date of the most recent use, or null if never. */
  lastUsed: string | null;
  verdict: "deepen" | "keep" | "niche" | "shallow" | "cut" | "thin";
  /** The reasoning, in the words a decision needs to be defended in. */
  because: string;
}

/** Adoption at or above this reads as "most people", not "some people". */
const WIDE_ADOPTION = 0.6;
/** Below this, a feature is the preserve of a handful. */
const NARROW_ADOPTION = 0.2;
/** Uses per adopter at or above this means they came back rather than tried once. */
const RETURNED = 2;
/** And at or above this, they lean on it. */
const RELIED_ON = 4;

/**
 * Rank every feature by who uses it, and say what to do about each.
 *
 * `activeUsers` is the denominator for adoption and is counted from the events
 * themselves: anyone who did anything at all in the window. Using the total
 * account count instead would score every feature against people who never
 * showed up, which makes a healthy product look dead.
 *
 * "thin" is a real verdict and comes first, because the honest answer for a
 * pilot this size is usually "we cannot tell yet" — and a verdict of "cut"
 * drawn from four events is worse than no verdict, since it will be quoted
 * later without its sample size.
 */
export function analyseFeatureAdoption(
  events: UsageFact[],
  windowDays: number,
  now: number = Date.now(),
): { rows: FeatureVerdict[]; activeUsers: number } {
  const cutoff = now - windowDays * 86_400_000;
  const inWindow = events.filter((e) => Date.parse(e.created_at) >= cutoff);
  const activeUsers = new Set(inWindow.map((e) => e.user_id)).size;

  const rows = FEATURES.map(({ label, events: names }) => {
    const mine = inWindow.filter((e) => names.includes(e.event));
    const users = new Set(mine.map((e) => e.user_id)).size;
    const uses = mine.length;
    const adoption = activeUsers > 0 ? users / activeUsers : 0;
    const depth = users > 0 ? uses / users : 0;
    const lastUsed =
      mine.length > 0
        ? mine.reduce(
            (latest, e) => (e.created_at > latest ? e.created_at : latest),
            mine[0].created_at,
          )
        : null;

    const pct = Math.round(adoption * 100);
    let verdict: FeatureVerdict["verdict"];
    let because: string;

    if (uses < THIN_EVIDENCE) {
      verdict = "thin";
      because =
        uses === 0
          ? "Nobody has touched it in this window. Too little to call — check a longer range before reading anything into it."
          : `Only ${uses} ${uses === 1 ? "use" : "uses"} in total. Too little to call.`;
    } else if (adoption >= WIDE_ADOPTION && depth >= RELIED_ON) {
      verdict = "deepen";
      because = `${pct}% of active people used it, ${depth.toFixed(1)} times each. Widely used and returned to — worth building further.`;
    } else if (adoption < NARROW_ADOPTION && depth < RETURNED) {
      verdict = "cut";
      because = `Only ${pct}% tried it and they did not come back (${depth.toFixed(1)} uses each). The clearest candidate to drop.`;
    } else if (adoption < NARROW_ADOPTION) {
      verdict = "niche";
      because = `Only ${pct}% used it, but those who did came back (${depth.toFixed(1)} times each). Small and real — cutting it would cost those people something.`;
    } else if (depth < RETURNED) {
      /*
        Plenty of people tried it and none of them came back.

        This case used to fall through to "keep", which is the wrong reading and
        the most expensive one to get wrong: broad first use looks like success
        in any chart that counts events, and the number that contradicts it —
        roughly one use per person — is the one that says the feature did not
        hold anybody. It is a different problem from "cut", because the interest
        is real and it is the second visit that is missing.
      */
      verdict = "shallow";
      because = `${pct}% tried it but barely returned (${depth.toFixed(1)} uses each). The interest is there and something about it is not holding people — worth fixing or dropping, not leaving.`;
    } else {
      verdict = "keep";
      because = `${pct}% used it, ${depth.toFixed(1)} times each. Doing its job without needing attention.`;
    }

    return { label, users, adoption, uses, depth, lastUsed, verdict, because };
  });

  // Widest adoption first, then volume — the order a decision gets made in.
  rows.sort((a, b) => b.adoption - a.adoption || b.uses - a.uses);
  return { rows, activeUsers };
}
