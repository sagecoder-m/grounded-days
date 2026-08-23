/**
 * Domain types for the app's data.
 *
 * These live here rather than in store.ts so the db layer can import them
 * without a cycle (store.ts imports the db layer, and re-exports everything
 * below so existing `import { Task } from "@/lib/store"` sites keep working).
 *
 * Shapes are unchanged from the pre-Supabase store on purpose: the relational
 * schema is mapped back into these by src/lib/db/mappers.ts, so components
 * needed no type changes when the storage layer moved.
 */

export type Area = "personal" | "professional" | "education";

export interface Task {
  id: string;
  area: Area;
  title: string;
  description?: string;
  date?: string; // ISO yyyy-mm-dd
  done: boolean;
  createdAt: number;
  // Optional linkage for professional tasks
  projectId?: string;
  subprojectId?: string;
}

export interface Habit {
  id: string;
  name: string;
  createdAt: number;
  log: Record<string, boolean>; // date -> completed
}

/** One concrete, tickable piece of a goal. */
export interface GoalStep {
  id: string;
  title: string;
  done: boolean;
}

export interface Goal {
  id: string;
  area: Area;
  name: string;
  description?: string;
  /**
   * 0..100. Derived from `steps` whenever the goal has any — the manual number
   * is only a fallback for goals created before steps existed.
   */
  progress: number;
  steps: GoalStep[];
  projectId?: string;
  subprojectId?: string;
}

export interface Subproject {
  id: string;
  name: string;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: "active" | "paused" | "done";
  /** Projects predate areas; existing ones are all professional. */
  area: Area;
  subprojects: Subproject[];
}

/** Where an event came from. Anything other than "local" is mirrored from a
 *  provider and is read-only in Grounded — enforced by RLS, not just the UI. */
export type EventSource = "local" | "google" | "microsoft";

export interface CalEvent {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  area?: Area;
  source: EventSource;
  /** Null for all-day events, which have no meaningful instant. */
  startsAt?: string;
  endsAt?: string;
  allDay: boolean;
  location?: string;
  /** Deep link back to the event in Google/Outlook. */
  htmlLink?: string;
}

export type CalendarProvider = "google" | "microsoft";

/** 'needs_reauth' is routine rather than exceptional: Google refresh tokens for
 *  an unverified app expire weekly, so the UI must surface it plainly. */
export type ConnectionStatus = "connected" | "needs_reauth" | "error";

export interface CalendarConnection {
  id: string;
  provider: CalendarProvider;
  accountEmail?: string;
  defaultArea?: Area;
  status: ConnectionStatus;
  statusDetail?: string;
  lastSyncedAt?: string;
}

export interface FocusSession {
  id: string;
  label: string;
  minutes: number;
  completedAt: number;
}

export type AccentVariant = "sage" | "clay" | "brown" | "tan";
export type Density = "compact" | "comfy";
export type CalView = "week" | "month" | "year";

/** Where the main navigation lives. */
export type NavLayout = "sidebar" | "top";

export interface Settings {
  displayName: string;
  density: Density;
  accent: AccentVariant;
  defaultCalView: CalView;
  navLayout: NavLayout;
  widgets: { key: string; enabled: boolean }[];
}

export interface AppState {
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
  projects: Project[];
  events: CalEvent[];
  focusSessions: FocusSession[];
  settings: Settings;
}

/** Sidebar sync indicator state. Derived from React Query activity. */
export type SyncStatus = "local" | "syncing" | "synced" | "error";
