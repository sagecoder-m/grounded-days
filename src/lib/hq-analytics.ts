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
import { differenceInCalendarWeeks, format, startOfWeek } from "date-fns";

export interface RetentionAccount {
  id: string;
  createdAt: string;
}

export interface UsageFact {
  user_id: string;
  event: string;
  created_at: string;
}

export interface Cell {
  /** null when the week has not elapsed for this cohort yet. */
  pct: number | null;
  active: number;
}

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

export function buildCohorts(accounts: RetentionAccount[], events: UsageFact[]) {
  const now = new Date();
  const thisWeek = startOfWeek(now, WEEK_OPTS);

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
          cells.push({ pct: null, active: 0 });
          continue;
        }
        const active = members.filter((m) => activeWeeks.get(m.id)?.has(offset)).length;
        cells.push({ pct: (active / members.length) * 100, active });
      }
      return {
        weekStart,
        label: format(weekStart, "MMM d"),
        size: members.length,
        cells,
      };
    });

  const widest = cohorts.reduce((max, c) => {
    const last = c.cells.reduce((n, cell, i) => (cell.pct === null ? n : i + 1), 0);
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
