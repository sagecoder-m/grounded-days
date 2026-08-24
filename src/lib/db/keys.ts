/**
 * Query keys, all scoped by user id.
 *
 * Scoping by user id (plus the queryClient.clear() that already runs on sign
 * out) is what guarantees one account can never read another's cached rows.
 */

const ROOT = "grounded";

export const qk = {
  /** Everything for one user — used to invalidate the whole tree at once. */
  all: (userId: string) => [ROOT, userId] as const,
  tasks: (userId: string) => [ROOT, userId, "tasks"] as const,
  habits: (userId: string) => [ROOT, userId, "habits"] as const,
  habitLogs: (userId: string) => [ROOT, userId, "habitLogs"] as const,
  goals: (userId: string) => [ROOT, userId, "goals"] as const,
  goalSteps: (userId: string) => [ROOT, userId, "goalSteps"] as const,
  projects: (userId: string) => [ROOT, userId, "projects"] as const,
  subprojects: (userId: string) => [ROOT, userId, "subprojects"] as const,
  events: (userId: string) => [ROOT, userId, "events"] as const,
  journal: (userId: string) => [ROOT, userId, "journal"] as const,
  calendarConnections: (userId: string) => [ROOT, userId, "calendarConnections"] as const,
  focusSessions: (userId: string) => [ROOT, userId, "focusSessions"] as const,
  settings: (userId: string) => [ROOT, userId, "settings"] as const,
  hasPasscode: (userId: string) => [ROOT, userId, "hasPasscode"] as const,
};
