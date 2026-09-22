/**
 * A duplicate of src/lib/notification-copy.ts, kept in sync by hand — see
 * affirmations.ts in this same directory for why edge functions in this
 * codebase never import across into src/.
 */

export type Area = "personal" | "professional" | "education";

export interface TaskDueInput {
  id: string;
  title: string;
  dueTime: string;
  courseTag?: string | null;
  area: Area;
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

export function taskUrl(task: { id: string; area: Area; projectId?: string | null }): string {
  const base =
    task.area === "professional"
      ? task.projectId
        ? `/professional/${task.projectId}`
        : "/professional"
      : `/${task.area}`;
  return `${base}?taskId=${task.id}`;
}

export function taskDueCopy(task: TaskDueInput): NotificationCopy {
  const prefix = task.courseTag ? `${task.courseTag} · ` : "";
  const timeOfDay = minutesOf(task.dueTime) >= 18 * 60 ? "tonight" : "today";
  return {
    title: `${prefix}${task.title}`,
    body: `Due at ${formatDueTime(task.dueTime)} ${timeOfDay}.`,
    url: taskUrl(task),
  };
}

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
