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
  /** Set when this task is an assignment for a course. */
  courseId?: string;
}

/** A course in the Education area. Assignments are tasks carrying its id. */
export interface Course {
  id: string;
  name: string;
  /** Optional — "Statistics" is a complete answer. */
  code?: string;
  term?: string;
  position: number;
  createdAt: number;
}

export interface Habit {
  id: string;
  name: string;
  position: number;
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
  /** Drag order within its area. */
  position: number;
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
  position: number;
  subprojects: Subproject[];
}

/** Where an event came from. Anything other than "local" is mirrored from a
 *  provider and is read-only in Grounded — enforced by RLS, not just the UI. */
export type EventSource = "local" | "google" | "microsoft" | "ical";

export interface CalEvent {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd — the day it starts
  /**
   * Last day, for an event spanning several. Undefined means a single day.
   * Inclusive: an event from the 1st to the 3rd covers all three days.
   */
  endDate?: string;
  area?: Area;
  source: EventSource;
  /**
   * Which connection mirrored this event. Undefined for local events.
   *
   * Needed because one person can connect several accounts with the same
   * provider — two Google calendars, a work and a personal Outlook — and the
   * calendar has to keep them apart. The provider alone cannot do that.
   */
  connectionId?: string;
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

export type CalendarProvider = "google" | "microsoft" | "ical";

/** 'needs_reauth' is routine rather than exceptional: Google refresh tokens for
 *  an unverified app expire weekly, so the UI must surface it plainly. */
export type ConnectionStatus = "connected" | "needs_reauth" | "error";

export interface CalendarConnection {
  id: string;
  provider: CalendarProvider;
  accountEmail?: string;
  /** The subscribed URL, for an ical connection. Its own credential. */
  feedUrl?: string;
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

/** How the assistant should speak to this person, in their own words. */
export type AssistantTone = "gentle" | "neutral" | "direct";
export type AssistantLength = "brief" | "balanced" | "thorough";

/**
 * How much of the Overview grid a widget takes.
 *
 * Two columns on a wide screen, one below that. "wide" spans both, "square"
 * takes one, "tall" takes one and two rows — enough vocabulary to put two things
 * side by side or give a long list the height it wants, without becoming a
 * layout editor nobody asked for.
 */
export type WidgetSize = "square" | "wide" | "tall";

export interface Settings {
  displayName: string;
  density: Density;
  accent: AccentVariant;
  defaultCalView: CalView;
  navLayout: NavLayout;
  weekStartsOn: WeekStart;
  assistantTone: AssistantTone;
  assistantLength: AssistantLength;
  /** Free text the client writes for the assistant. Capped at 600 chars. */
  assistantNotes: string;
  /** Size is optional on read for rows written before it existed. */
  widgets: { key: string; enabled: boolean; size: WidgetSize }[];
  showFocusTimer: boolean;
}

export interface AppState {
  tasks: Task[];
  journal: JournalEntry[];
  habits: Habit[];
  goals: Goal[];
  projects: Project[];
  events: CalEvent[];
  courses: Course[];
  focusSessions: FocusSession[];
  settings: Settings;
}

/** Sidebar sync indicator state. Derived from React Query activity. */
export type SyncStatus = "local" | "syncing" | "synced" | "error";
