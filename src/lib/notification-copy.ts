/**
 * Every string (and link) a push notification can show, in one place.
 *
 * Kept separate from the components and the sender that call it so the
 * words themselves are directly testable — see notification-copy.test.ts,
 * which is the actual point of this file existing on its own.
 *
 * supabase/functions/_shared/notification-copy.ts is a hand-synced
 * duplicate of this file for the scheduled sender, which cannot import
 * from src/ — see that file's own comment for why.
 */

import type { Area } from "./store-types";

export interface TaskDueInput {
  id: string;
  title: string;
  /** "HH:MM", timezone-naive — see store-types.ts for why. */
  dueTime: string;
  /** A course's own tag, e.g. "OPAN 6605". Omitted for Personal tasks. */
  courseTag?: string | null;
  area: Area;
  /** Only meaningful for a professional-area task — see taskUrl. */
  projectId?: string | null;
}

export interface NotificationCopy {
  title: string;
  body: string;
  url: string;
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
 * Where a tap on this task's notification should land — the page that task
 * actually renders on, with `?taskId=` for that page's own use-highlight-task
 * hook to scroll to and briefly mark it. Personal and education tasks live on
 * a flat area page; a professional task lives under its project, so without a
 * project id there is nowhere specific to send it and the area root is the
 * honest fallback.
 */
export function taskUrl(task: { id: string; area: Area; projectId?: string | null }): string {
  const base =
    task.area === "professional"
      ? task.projectId
        ? `/professional/${task.projectId}`
        : "/professional"
      : `/${task.area}`;
  return `${base}?taskId=${task.id}`;
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
    url: taskUrl(task),
  };
}

/**
 * One sentence, naming one thing — never a list, never a count of what else
 * is waiting. `oneThing` is whatever pickOneThing already chose; when there
 * is nothing open at all, `fallbackLine` (an affirmation) fills the body
 * instead, so the notification is never empty on a genuinely clear day, and
 * the link falls back to the overview rather than a specific task that does
 * not exist.
 */
export function morningCopy(
  oneThing: { title: string; id: string; area: Area; projectId?: string | null } | null,
  fallbackLine: string,
): NotificationCopy {
  return {
    title: "One thing today",
    body: oneThing ? oneThing.title : fallbackLine,
    url: oneThing ? taskUrl(oneThing) : "/",
  };
}
