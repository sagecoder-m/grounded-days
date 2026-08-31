import { addDays } from "date-fns";

/**
 * The app's day key, and the one thing every date-bucketed feature agrees on.
 *
 * Lived in components/task-grid.tsx, which meant a dozen modules imported a
 * component file to get a date function — and a second copy of it grew in
 * calendar-dialogs as `iso`, written with format() instead. Two
 * implementations of the same value is how one of them eventually disagrees.
 */

/** Local yyyy-mm-dd. Not toISOString(), which converts to UTC first and so
 *  reports the previous day for anyone west of Greenwich after 5pm. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** dateKey for today, and for `days` after today. */
export function dayRange(days: number, startOffset = 0) {
  const base = new Date();
  return {
    from: dateKey(addDays(base, startOffset)),
    to: dateKey(addDays(base, startOffset + days - 1)),
  };
}
