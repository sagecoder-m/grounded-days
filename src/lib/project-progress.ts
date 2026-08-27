import type { AppState, Project } from "@/lib/store-types";

/**
 * How far a project has got, as one number.
 *
 * Percentages are kept out of the personal side of this app on purpose — a
 * percentage implies a whole, and a life has no denominator. Work is the
 * exception the brief asks for, and it is a fair one: a project genuinely does
 * have a finite list of things in it, so "60%" is a description rather than a
 * verdict. It is still only ever shown against a project, never against a
 * person.
 *
 * Goals and tasks are averaged together, weighted by how many of each there
 * are, so a project with twenty tasks and one goal is not reported as half done
 * the moment that goal is. Empty projects are zero rather than complete, which
 * is the honest reading of "nothing in here yet".
 */
export function projectProgress(state: AppState, project: Project): number {
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  const goals = state.goals.filter((g) => g.projectId === project.id);

  const parts = [
    ...tasks.map((t) => (t.done ? 100 : 0)),
    ...goals.map((g) => Math.max(0, Math.min(100, g.progress))),
  ];
  if (parts.length === 0) return 0;
  return Math.round(parts.reduce((sum, n) => sum + n, 0) / parts.length);
}

/** The same, across every project in an area. */
export function areaProjectProgress(state: AppState, projects: Project[]): number {
  if (projects.length === 0) return 0;
  return Math.round(
    projects.reduce((sum, p) => sum + projectProgress(state, p), 0) / projects.length,
  );
}

/**
 * Where you were.
 *
 * Deliberately the last project you *opened*, read from this device, rather than
 * anything inferred from the data. There is no updated_at on a project, so the
 * alternatives are all guesses — most recently created, or the one holding the
 * newest task — and a guess that is confidently wrong ("continue where you left
 * off" pointing at something you have not touched in a month) is worse than no
 * panel at all.
 *
 * Per-device on purpose too: where you left off on your laptop is not where you
 * left off on your phone.
 */
const LAST_PROJECT_KEY = "grounded.lastProject";

export function rememberProject(id: string) {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Storage off or full. The panel falls back to nothing, which is fine.
  }
}

export function lastProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}
