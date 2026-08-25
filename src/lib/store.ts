/**
 * The app's data facade.
 *
 * This used to be a localStorage-backed singleton that mirrored the whole state
 * into one Supabase jsonb blob. It is now a thin read/write layer over
 * relational tables via React Query — but the public API is deliberately
 * unchanged (`useAppState`, `useApp`, `actions`, `useSyncStatus`, `AREA_META`,
 * `todayISO`) so the routes and components that consume it did not have to be
 * rewritten.
 *
 * The one behavioural change callers should know about: `actions.*` are now
 * fire-and-forget async writes. They patch the cache optimistically, so reads
 * still reflect a change on the next render, but the row hits Postgres a moment
 * later. Failures roll the cache back and toast.
 */
import { useMemo } from "react";
import { useIsFetching, useIsMutating, useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useStoreContext } from "./db/context";
import { qk } from "./db/keys";
import { DEFAULT_SETTINGS } from "./db/mappers";
import {
  coursesQuery,
  eventsQuery,
  focusSessionsQuery,
  goalsQuery,
  goalStepsQuery,
  habitLogsQuery,
  habitsQuery,
  journalQuery,
  projectsQuery,
  settingsQuery,
  subprojectsQuery,
  tasksQuery,
} from "./db/queries";
import { hasWriteFailure, subscribeToWriteFailures } from "./db/mutations";
import type { AppState, Area, Goal, Habit, Project, SyncStatus } from "./store-types";

export type {
  AccentVariant,
  AssistantLength,
  Course,
  AssistantTone,
  AppState,
  Area,
  CalEvent,
  CalView,
  Density,
  FocusSession,
  Goal,
  GoalStep,
  Habit,
  JournalEntry,
  Mood,
  NavLayout,
  Project,
  Settings,
  Subproject,
  SyncStatus,
  Task,
  WeekStart,
  WidgetSize,
} from "./store-types";

export { actions, deleteAllUserData } from "./db/mutations";

const EMPTY_STATE: AppState = {
  tasks: [],
  habits: [],
  goals: [],
  projects: [],
  events: [],
  courses: [],
  journal: [],
  focusSessions: [],
  settings: DEFAULT_SETTINGS,
};

/**
 * Composes the nine collection queries back into the single AppState shape the
 * components expect — rebuilding `Habit.log` from habit_logs rows and nesting
 * `Project.subprojects` from the subprojects table.
 *
 * Queries are disabled until AppGate registers a signed-in user, which is also
 * why nothing fetches while the app is locked.
 */
export function useAppState(): AppState {
  const ctx = useStoreContext();
  const userId = ctx?.userId ?? "anonymous";
  const enabled = Boolean(ctx);

  const tasks = useQuery({ ...tasksQuery(userId), enabled });
  const habits = useQuery({ ...habitsQuery(userId), enabled });
  const habitLogs = useQuery({ ...habitLogsQuery(userId), enabled });
  const goals = useQuery({ ...goalsQuery(userId), enabled });
  const goalSteps = useQuery({ ...goalStepsQuery(userId), enabled });
  const projects = useQuery({ ...projectsQuery(userId), enabled });
  const subprojects = useQuery({ ...subprojectsQuery(userId), enabled });
  const events = useQuery({ ...eventsQuery(userId), enabled });
  const courses = useQuery({ ...coursesQuery(userId), enabled });
  const journal = useQuery({ ...journalQuery(userId), enabled });
  const focusSessions = useQuery({ ...focusSessionsQuery(userId), enabled });
  const settings = useQuery({ ...settingsQuery(userId), enabled });

  return useMemo(() => {
    if (!enabled) return EMPTY_STATE;

    const logsByHabit = new Map<string, Record<string, boolean>>();
    for (const entry of habitLogs.data ?? []) {
      const existing = logsByHabit.get(entry.habitId);
      if (existing) existing[entry.date] = true;
      else logsByHabit.set(entry.habitId, { [entry.date]: true });
    }

    const composedHabits: Habit[] = (habits.data ?? []).map((habit) => ({
      ...habit,
      log: logsByHabit.get(habit.id) ?? {},
    }));

    const stepsByGoal = new Map<string, Goal["steps"]>();
    for (const step of goalSteps.data ?? []) {
      const entry = { id: step.id, title: step.title, done: step.done };
      const existing = stepsByGoal.get(step.goalId);
      if (existing) existing.push(entry);
      else stepsByGoal.set(step.goalId, [entry]);
    }

    const composedGoals: Goal[] = (goals.data ?? []).map((goal) => {
      const steps = stepsByGoal.get(goal.id) ?? [];
      return {
        ...goal,
        steps,
        // Steps are the source of truth once they exist. Goals created before
        // steps keep the number they were given, so nothing resets to zero.
        progress: steps.length
          ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
          : goal.progress,
      };
    });

    const subsByProject = new Map<string, Project["subprojects"]>();
    for (const sub of subprojects.data ?? []) {
      const entry = { id: sub.id, name: sub.name, description: sub.description };
      const existing = subsByProject.get(sub.projectId);
      if (existing) existing.push(entry);
      else subsByProject.set(sub.projectId, [entry]);
    }

    const composedProjects: Project[] = (projects.data ?? []).map((project) => ({
      ...project,
      subprojects: subsByProject.get(project.id) ?? [],
    }));

    return {
      tasks: tasks.data ?? [],
      habits: composedHabits,
      goals: composedGoals,
      projects: composedProjects,
      events: events.data ?? [],
      courses: courses.data ?? [],
      journal: journal.data ?? [],
      focusSessions: focusSessions.data ?? [],
      settings: settings.data ?? DEFAULT_SETTINGS,
    };
  }, [
    enabled,
    tasks.data,
    habits.data,
    habitLogs.data,
    goals.data,
    goalSteps.data,
    projects.data,
    subprojects.data,
    events.data,
    courses.data,
    journal.data,
    focusSessions.data,
    settings.data,
  ]);
}

/**
 * Selector read. Note the selector is applied to an already-memoized AppState,
 * so an inline arrow at the call site is fine here (it was not under the old
 * useSyncExternalStore implementation, which resubscribed every render).
 */
export function useApp<T>(selector: (s: AppState) => T): T {
  const state = useAppState();
  return selector(state);
}

/**
 * Sidebar sync indicator, derived from React Query activity rather than a
 * bespoke push queue. "local" is no longer reachable now that an account is
 * required, but stays in the union so callers keep type-checking.
 */
export function useSyncStatus(): SyncStatus {
  const mutating = useIsMutating();
  const fetching = useIsFetching();
  const failed = useSyncExternalStore(subscribeToWriteFailures, hasWriteFailure, () => false);

  if (mutating > 0 || fetching > 0) return "syncing";
  if (failed) return "error";
  return "synced";
}

/** Re-exported so callers can invalidate everything after a bulk change. */
export { qk as queryKeys };

// ---------- helpers ----------
export const AREA_META: Record<
  Area,
  { label: string; color: string; bg: string; text: string; ring: string }
> = {
  personal: {
    label: "Personal",
    color: "sage",
    bg: "bg-sage-soft",
    text: "text-sage-deep",
    ring: "ring-sage",
  },
  professional: {
    label: "Professional",
    color: "brown",
    bg: "bg-brown-soft",
    text: "text-[color:var(--brown)]",
    ring: "ring-[color:var(--brown)]",
  },
  education: {
    label: "Education",
    color: "clay",
    bg: "bg-clay-soft",
    text: "text-[color:var(--clay)]",
    ring: "ring-[color:var(--clay)]",
  },
};

/**
 * Today as yyyy-mm-dd, in the person's own timezone.
 *
 * This used to be `toISOString().slice(0, 10)`, which converts to UTC first. West
 * of Greenwich that means the date rolls over in the evening while it is still
 * the same day locally — at 8pm in New York this returned tomorrow. Every task
 * created after that hour was dated a day late, and habits ticked at night were
 * logged against the wrong column.
 *
 * The same conversion is what dateKey() in task-grid.tsx does; this is the one
 * for callers that only need today and should not import a component.
 */
export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}
