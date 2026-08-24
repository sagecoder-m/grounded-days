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

/** Named rather than numeric on purpose — see the migration. */
export type Mood = "low" | "tender" | "steady" | "good" | "wired";

export interface JournalEntry {
  id: string;
  /** ISO yyyy-mm-dd. One entry per day. */
  date: string;
  body: string;
  mood?: Mood;
  gratitude?: string;
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

/**
 * Which day a week starts on, as the day number date-fns and DayFlow both take
 * (0 = Sunday, 1 = Monday, 6 = Saturday). Stored as the number rather than a
 * label so it can be passed straight to startOfWeek() and to DayFlow's view
 * config with no lookup in between.
 *
 * Only these three: they are the conventions that exist in practice. A week
 * starting Wednesday is a typo, not a preference.
 */
export type WeekStart = 0 | 1 | 6;

export interface Settings {
  displayName: string;
  density: Density;
  accent: AccentVariant;
  defaultCalView: CalView;
  navLayout: NavLayout;
  weekStartsOn: WeekStart;
  widgets: { key: string; enabled: boolean }[];
}

export interface AppState {
  tasks: Task[];
  journal: JournalEntry[];
  habits: Habit[];
  goals: Goal[];
  projects: Project[];
  events: CalEvent[];
  focusSessions: FocusSession[];
  settings: Settings;
}

/** Sidebar sync indicator state. Derived from React Query activity. */
export type SyncStatus = "local" | "syncing" | "synced" | "error";
