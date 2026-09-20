/**
 * A duplicate of src/lib/notification-copy.ts, kept in sync by hand — see
 * affirmations.ts in this same directory for why edge functions in this
 * codebase never import across into src/.
 */

export interface TaskDueInput {
  title: string;
  dueTime: string;
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

export function taskDueCopy(task: TaskDueInput): NotificationCopy {
  const prefix = task.courseTag ? `${task.courseTag} · ` : "";
  const timeOfDay = minutesOf(task.dueTime) >= 18 * 60 ? "tonight" : "today";
  return {
    title: `${prefix}${task.title}`,
    body: `Due at ${formatDueTime(task.dueTime)} ${timeOfDay}.`,
  };
}

export function morningCopy(oneThingTitle: string | null, fallbackLine: string): NotificationCopy {
  return {
    title: "One thing today",
    body: oneThingTitle ?? fallbackLine,
  };
}
