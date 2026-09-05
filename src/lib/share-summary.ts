import type { Area } from "@/lib/store-types";

/**
 * Turns a shared account's counts into something a person can read.
 *
 * The audience is a therapist, a partner, a parent — someone who has been
 * handed a link and wants to know how the last couple of months have gone and
 * where to offer help. They are not a user of this app and will not learn its
 * vocabulary. They get sentences.
 *
 * The whole module is written against one rule: nothing here may read as a
 * report card. That is not a tone preference, it is the point of the feature —
 * a page that makes someone feel caught is a page they stop sharing, and the
 * person it describes is often the one who opens it first.
 *
 * In practice that means:
 *
 * - No streaks, no percentages of days, no "missed", no "behind", no red.
 *   Absence is never counted. Six finished things is six finished things; it is
 *   not "60% of ten".
 * - No denominators either, which is the same rule one step further and easy to
 *   miss: "tended on 17 of the last 56 days" states a presence and hands the
 *   reader a subtraction. "17 days in the last 8 weeks" says the same true
 *   thing with nothing to fall short of.
 * - "Waiting" for work past its date, not "overdue" or "late". The work is
 *   waiting; the person is not failing.
 * - A quiet area is described as quiet, and quiet is allowed. Someone in a hard
 *   month whose Professional area is empty is not doing badly at work — they
 *   may be off sick, and this page cannot tell the difference, so it does not
 *   claim to.
 * - Nothing is ever called good or bad. The page reports where attention went
 *   and where things are stacking up, and lets the two people talking decide
 *   what that means.
 */

export const AREAS: Area[] = ["personal", "professional", "education"];

export const AREA_LABEL: Record<Area, string> = {
  personal: "Personal",
  professional: "Professional",
  education: "Education",
};

export interface AreaStanding {
  area: Area;
  /** Finished in the window. */
  done: number;
  /** Still open, of any date. */
  open: number;
  /** Open and past its date. Called "waiting" everywhere it is shown. */
  waiting: number;
  /** Goals in this area, and how far along they are on average. */
  goals: number;
  goalProgress: number | null;
}

export interface WeekPoint {
  /** ISO date of the week's Monday. */
  weekStart: string;
  byArea: Record<Area, number>;
  total: number;
}

export interface ShareSummary {
  standings: AreaStanding[];
  weeks: WeekPoint[];
  /** Days in the window with at least one habit check-in, and the window size. */
  habitDays: number;
  windowDays: number;
  /** Two or three plain sentences. The only prose on the page. */
  sentences: string[];
  /** Areas worth a conversation, most pressing first. Never called "problems". */
  needsSupport: Area[];
  /** Nothing has been recorded at all — a different page, not a sad one. */
  empty: boolean;
}

interface Input {
  since: string;
  today: string;
  areas: Area[];
  completions: { area: Area; date: string }[];
  openWork: { area: Area; date: string | null }[];
  goals: { area: Area; progress: number }[];
  habitCheckins: { date: string }[];
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  // getDay() is 0 for Sunday; shift so Monday starts the week, matching the
  // rest of the app's default.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

export function summarise(input: Input): ShareSummary {
  const { since, today, areas, completions, openWork, goals, habitCheckins } = input;
  const inScope = AREAS.filter((a) => areas.includes(a));

  const standings: AreaStanding[] = inScope.map((area) => {
    const areaGoals = goals.filter((g) => g.area === area);
    const open = openWork.filter((t) => t.area === area);
    return {
      area,
      done: completions.filter((c) => c.area === area).length,
      open: open.length,
      waiting: open.filter((t) => t.date !== null && t.date < today).length,
      goals: areaGoals.length,
      goalProgress: areaGoals.length
        ? Math.round(areaGoals.reduce((sum, g) => sum + g.progress, 0) / areaGoals.length)
        : null,
    };
  });

  // Weeks, oldest first, with empty weeks kept. A gap in the run is information
  // — dropping quiet weeks would draw a steadier line than the one lived.
  const weekMap = new Map<string, Record<Area, number>>();
  for (
    let cursor = mondayOf(since);
    cursor <= today;
    cursor = new Date(Date.parse(`${cursor}T00:00:00`) + 7 * 86_400_000).toISOString().slice(0, 10)
  ) {
    weekMap.set(cursor, { personal: 0, professional: 0, education: 0 });
  }
  for (const c of completions) {
    const week = weekMap.get(mondayOf(c.date));
    if (week) week[c.area] += 1;
  }
  const weeks: WeekPoint[] = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, byArea]) => ({
      weekStart,
      byArea,
      total: byArea.personal + byArea.professional + byArea.education,
    }));

  const habitDays = new Set(habitCheckins.map((h) => h.date)).size;
  const windowDays = daysBetween(since, today);

  /*
    Where support is worth offering: most waiting first.

    Deliberately not "least done". An area with nothing finished might be one
    nobody is working in this month, which is a choice and not a difficulty.
    Work that is *sitting past its date* is the honest signal — something was
    intended, and it has not been possible yet. That is the thing worth asking a
    gentle question about.
  */
  const needsSupport = standings
    .filter((s) => s.waiting > 0)
    .sort((a, b) => b.waiting - a.waiting)
    .map((s) => s.area);

  const totalDone = standings.reduce((n, s) => n + s.done, 0);
  const totalOpen = standings.reduce((n, s) => n + s.open, 0);
  const empty = totalDone === 0 && totalOpen === 0 && goals.length === 0;

  return {
    standings,
    weeks,
    habitDays,
    windowDays,
    needsSupport,
    empty,
    sentences: sentencesFor({ standings, totalDone, habitDays, windowDays, needsSupport, empty }),
  };
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sentencesFor({
  standings,
  totalDone,
  habitDays,
  windowDays,
  needsSupport,
  empty,
}: {
  standings: AreaStanding[];
  totalDone: number;
  habitDays: number;
  windowDays: number;
  needsSupport: Area[];
  empty: boolean;
}): string[] {
  if (empty) {
    return [
      "There is nothing recorded here yet — this is a new or quiet space rather than an empty one.",
    ];
  }

  const out: string[] = [];
  const weeks = Math.max(1, Math.round(windowDays / 7));
  const span = weeks === 1 ? "week" : `${weeks} weeks`;

  /*
    Open on what happened, never on what did not.

    The first sentence sets how the rest is read, and "12 things finished across
    three areas" and "38% completion" describe the same fortnight to very
    different effect. Only one of them is a number someone can feel judged by.
  */
  if (totalDone > 0) {
    const busiest = [...standings].sort((a, b) => b.done - a.done)[0];
    const named = standings.filter((s) => s.done > 0).map((s) => AREA_LABEL[s.area]);
    out.push(
      `Over the last ${span}, ${totalDone} ${totalDone === 1 ? "thing was" : "things were"} finished` +
        (named.length > 1
          ? `, across ${list(named)} — most of it in ${AREA_LABEL[busiest.area]}.`
          : ` in ${named[0]}.`),
    );
  } else {
    out.push(
      `Nothing has been ticked off in the last ${span}. That can mean a hard stretch, or simply that things are being tracked elsewhere.`,
    );
  }

  // Goals, when there are any. Progress is stated, never graded.
  const withGoals = standings.filter((s) => s.goals > 0);
  if (withGoals.length > 0) {
    const moving = withGoals.filter((s) => (s.goalProgress ?? 0) > 0);
    out.push(
      moving.length > 0
        ? `Goals are underway in ${list(moving.map((s) => AREA_LABEL[s.area]))}.`
        : `There are goals set in ${list(withGoals.map((s) => AREA_LABEL[s.area]))}, not yet started.`,
    );
  }

  /*
    The support line. This is the sentence the page exists for, and the one most
    easily got wrong — it has to point somewhere useful without landing as an
    accusation. So it names the area and the number, offers no cause, and says
    plainly that the number alone does not explain itself.
  */
  if (needsSupport.length > 0) {
    const top = standings.find((s) => s.area === needsSupport[0])!;
    out.push(
      `${AREA_LABEL[top.area]} has ${top.waiting} ${top.waiting === 1 ? "thing" : "things"} waiting past ${top.waiting === 1 ? "its" : "their"} date — usually the most useful place to start a conversation.`,
    );
  } else if (habitDays > 0) {
    out.push(
      `Nothing is sitting past its date. Daily habits were tended on ${habitDays} ${habitDays === 1 ? "day" : "days"} in the last ${span}.`,
    );
  } else {
    out.push("Nothing is sitting past its date.");
  }

  return out;
}
