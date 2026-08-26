/**
 * The arithmetic behind the three reflective panels on the Overview.
 *
 * These exist to show someone the shape of their own weeks. That makes the
 * framing rules as binding as the maths:
 *
 * - Nothing here is scored, ranked, or compared to a target. There is no streak,
 *   no "best week", no percentage of a goal you were supposed to hit. A quiet
 *   stretch is a quiet stretch; it is not a failure, and nothing in this file
 *   produces a value that could be read as one.
 * - An empty day is absence of data, not a negative. It gets the page's own
 *   background, never a warning colour, and it is never counted against anything.
 * - Words for movement are descriptive, never evaluative: "quieter lately", not
 *   "falling behind".
 *
 * Kept apart from the components for the same reason the HQ maths is: date
 * bucketing and trend comparison are where this can be quietly wrong, and pure
 * functions over plain arrays can be tested against the awkward cases directly.
 */
import { addDays, differenceInCalendarDays, format, startOfWeek, subWeeks } from "date-fns";

import type { AppState, Area } from "./store-types";

/** Monday, matching the habit grid and the calendar. */
const WEEK_OPTS = { weekStartsOn: 1 } as const;

/** Local yyyy-mm-dd. Never toISOString, which converts to UTC first and rolls
 *  the date over in the evening west of Greenwich. */
export function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export const AREAS: Area[] = ["personal", "professional", "education"];

// ------------------------------------------------------------------- presence

export interface PresenceDay {
  date: string;
  /** How many distinct things happened. Zero is simply nothing, not a deficit. */
  count: number;
  /**
   * Whether this day is one we can say anything about.
   *
   * False in two cases, and both matter: days that have not happened yet, and
   * days before the record begins. The second was the bug — a twelve-week window
   * on a three-week-old account drew nine weeks of empty cells, which reads as
   * "you did nothing for two months" about a period when there was nothing to
   * record. Same lie as printing 0% retention for a week nobody was watching.
   */
  inRange: boolean;
}

/**
 * A day-by-day count of things the person actually did.
 *
 * Counts habit ticks, journal entries, finished focus sessions, completed tasks
 * and their own calendar entries — the same vocabulary the rest of the app
 * treats as "a deliberate action". Imported calendar events are excluded: a
 * lecture that appeared from a synced feed is not something the person did.
 */
export function dailyPresence(state: AppState, weeks: number, today = new Date()): PresenceDay[] {
  const counts = new Map<string, number>();
  const bump = (key: string, by = 1) => counts.set(key, (counts.get(key) ?? 0) + by);

  for (const habit of state.habits) {
    for (const [date, done] of Object.entries(habit.log)) if (done) bump(date);
  }
  for (const entry of state.journal) bump(entry.date);
  for (const session of state.focusSessions) bump(dayKey(new Date(session.completedAt)));
  // Completed tasks only: an outstanding task is not a thing that happened.
  for (const task of state.tasks) if (task.done && task.date) bump(task.date);
  for (const event of state.events) if (event.source === "local") bump(event.date);

  /**
   * The first day anything was recorded, or null if nothing ever was.
   *
   * yyyy-mm-dd sorts correctly as a string, so no parsing is needed. Derived
   * from the data rather than from an account creation date, which the client
   * does not hold — and which would be the wrong answer anyway for someone who
   * signed up and only started using it weeks later.
   */
  let firstRecord: string | null = null;
  for (const [date, count] of counts) {
    if (count > 0 && (firstRecord === null || date < firstRecord)) firstRecord = date;
  }

  // Whole weeks, so the grid's columns are weeks and the last column is this one.
  const start = startOfWeek(subWeeks(today, weeks - 1), WEEK_OPTS);
  const days: PresenceDay[] = [];
  const totalDays = weeks * 7;
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i);
    const key = dayKey(d);
    const happened = differenceInCalendarDays(d, today) <= 0;
    const recorded = firstRecord !== null && key >= firstRecord;
    days.push({
      date: key,
      count: counts.get(key) ?? 0,
      inRange: happened && recorded,
    });
  }
  return days;
}

/** The busiest day in the set, for scaling the shading. Never zero, so a person
 *  with one thing recorded does not divide by nothing. */
export function busiestDay(days: PresenceDay[]): number {
  return Math.max(1, ...days.map((d) => d.count));
}

// -------------------------------------------------------------------- balance

export interface BalanceWeek {
  /** Week start, for the key. */
  week: string;
  /** Short human label for the axis. */
  label: string;
  personal: number;
  professional: number;
  education: number;
}

/**
 * Per-week counts of things touched in each area.
 *
 * Deliberately NOT called time. Only timed calendar events carry a duration, and
 * focus sessions carry minutes but no area, so any "hours per area" figure would
 * be mostly invention. This counts things attended to, and the panel says so —
 * a smaller true statement beats a bigger false one.
 */
export function weeklyAreaBalance(
  state: AppState,
  weeks: number,
  today = new Date(),
): BalanceWeek[] {
  const firstWeek = startOfWeek(subWeeks(today, weeks - 1), WEEK_OPTS);
  const buckets = new Map<string, BalanceWeek>();
  for (let i = 0; i < weeks; i++) {
    const w = addDays(firstWeek, i * 7);
    buckets.set(dayKey(w), {
      week: dayKey(w),
      label: format(w, "d MMM"),
      personal: 0,
      professional: 0,
      education: 0,
    });
  }

  const add = (dateStr: string, area: Area) => {
    // Parsed by component: a yyyy-mm-dd through new Date() is UTC midnight and
    // can fall into the previous week.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const bucket = buckets.get(dayKey(startOfWeek(d, WEEK_OPTS)));
    if (bucket) bucket[area] += 1;
  };

  for (const task of state.tasks) if (task.done && task.date) add(task.date, task.area);
  for (const event of state.events) {
    if (event.source === "local" && event.area) add(event.date, event.area);
  }

  /*
    Drop the leading weeks that predate anything being recorded.

    Kept, they draw as a long flat run at zero, which says "attention went
    nowhere" about weeks when there was nothing to attend to — a three-week-old
    account was showing seven empty weeks before its first real one. Only the
    leading run goes: a genuinely quiet week *after* the record starts is real and
    stays, because that is information rather than absence of it.
  */
  const all = [...buckets.values()];
  const firstWithAnything = all.findIndex((w) => w.personal + w.professional + w.education > 0);
  // Nothing anywhere: hand back the empty window and let the panel show its own
  // empty state rather than an axis with no span.
  return firstWithAnything <= 0 ? all : all.slice(firstWithAnything);
}

// ------------------------------------------------------------------- movement

/** Descriptive, never evaluative. "quieter" is a fact about a week; "behind"
 *  would be a judgement about a person. */
export type Movement = "rising" | "steady" | "quieter" | "none";

export interface AreaMovement {
  area: Area;
  /** Weekly counts, oldest first — the shape, not a score. */
  points: number[];
  movement: Movement;
}

/**
 * How each area has been moving lately, as a shape and a word.
 *
 * The comparison is the most recent third of the window against the rest, which
 * is coarse on purpose. A week-on-week delta would flip between "rising" and
 * "quieter" constantly and make the panel feel like it was reacting to every
 * small thing — the opposite of what it is for.
 */
export function areaMovement(state: AppState, weeks: number, today = new Date()): AreaMovement[] {
  const balance = weeklyAreaBalance(state, weeks, today);
  /*
    A third of what we actually have, not a third of what was asked for.

    weeklyAreaBalance now trims weeks that predate any record, so on a young
    account the array is shorter than `weeks` — taking `weeks / 3` from it could
    ask for more recent weeks than exist and leave nothing to compare them
    against, which silently collapses every area to "steady".
  */
  const recentCount = Math.max(1, Math.round(balance.length / 3));

  return AREAS.map((area) => {
    const points = balance.map((b) => b[area]);
    const total = points.reduce((a, b) => a + b, 0);
    if (total === 0) return { area, points, movement: "none" as Movement };

    const recent = points.slice(-recentCount);
    const earlier = points.slice(0, -recentCount);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.length
      ? earlier.reduce((a, b) => a + b, 0) / earlier.length
      : recentAvg;

    // A tenth is wide enough that ordinary variation reads as steady, which is
    // the honest description of most weeks.
    const threshold = Math.max(0.5, earlierAvg * 0.1);
    const movement: Movement =
      recentAvg > earlierAvg + threshold
        ? "rising"
        : recentAvg < earlierAvg - threshold
          ? "quieter"
          : "steady";
    return { area, points, movement };
  });
}

/** The words shown for each movement. One place, so the tone cannot drift. */
export const MOVEMENT_WORDS: Record<Movement, string> = {
  rising: "Picking up lately",
  steady: "Holding steady",
  quieter: "Quieter lately",
  none: "Nothing here yet",
};
