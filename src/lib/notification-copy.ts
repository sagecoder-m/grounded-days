/**
 * Every string a push notification can show, in one place.
 *
 * Kept separate from the components and the sender that call it so the
 * words themselves are directly testable — see notification-copy.test.ts,
 * which is the actual point of this file existing on its own.
 *
 * supabase/functions/_shared/notification-copy.ts is a hand-synced
 * duplicate of this file for the scheduled sender, which cannot import
 * from src/ — see that file's own comment for why.
 */

export interface TaskDueInput {
  title: string;
  /** "HH:MM", timezone-naive — see store-types.ts for why. */
  dueTime: string;
  /** A course's own tag, e.g. "OPAN 6605". Omitted for Personal tasks. */
  courseTag?: string | null;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "23:59" -> "11:59 PM". */
export function formatDueTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * A task's own due time, stated once, plainly, with no sense of whether it
 * is early or late notice — this is only ever sent ahead of the time, never
 * after it (see send-notifications/index.ts for the window that enforces
 * that), so there is nothing here to soften.
 */
export function taskDueCopy(task: TaskDueInput): NotificationCopy {
  const prefix = task.courseTag ? `${task.courseTag} · ` : "";
  const timeOfDay = minutesOf(task.dueTime) >= 18 * 60 ? "tonight" : "today";
  return {
    title: `${prefix}${task.title}`,
    body: `Due at ${formatDueTime(task.dueTime)} ${timeOfDay}.`,
  };
}

/**
 * One sentence, naming one thing — never a list, never a count of what else
 * is waiting. `oneThingTitle` is whatever pickOneThing already chose; when
 * there is nothing open at all, `fallbackLine` (an affirmation) fills the
 * body instead, so the notification is never empty on a genuinely clear day.
 */
export function morningCopy(oneThingTitle: string | null, fallbackLine: string): NotificationCopy {
  return {
    title: "One thing today",
    body: oneThingTitle ?? fallbackLine,
  };
}
