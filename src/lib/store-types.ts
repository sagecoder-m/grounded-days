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
  /**
   * Optional 24-hour "HH:mm" the task is due on its date.
   *
   * Coursework deadlines are almost never "that day" — they are 11:59pm on
   * that day, and the difference is what makes something late. Kept separate
   * from `date` and timezone-naive on purpose: 11:59pm is 11:59pm where you
   * are, not an instant that moves when you travel.
   */
  dueTime?: string;
  done: boolean;
  createdAt: number;
  /**
   * When this row last changed, from the database's own trigger.
   *
   * Used as "when was this ticked". It is an approximation — renaming a
   * finished task moves it too — but the alternative is a completed_at column
   * whose only consumer is deciding whether a crossed-out line has earned the
   * right to leave today's list, and being a few hours out on that costs
   * nothing.
   */
  updatedAt: number;
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
  /**
   * The goal this habit works towards, if any.
   *
   * Optional and normally empty. A habit standing on its own is the common case
   * — "drink water" does not need an ambition behind it to be worth doing.
   */
  goalId?: string;
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
  /**
   * Optional day the goal is aimed at, ISO yyyy-mm-dd.
   *
   * Undefined is the normal case, not an incomplete one — plenty of goals have
   * no deadline and should not be given one. Set, it puts the goal on the
   * calendar for that day.
   */
  targetDate?: string;
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
 * Where a widget sits on the board, and how big it is.
 *
 * Free position and size, in grid units, rather than one of a handful of named
 * shapes. Named shapes were the wrong model: every one of them was a rule about
 * what a widget was allowed to be, and the board spent its life enforcing rules
 * instead of doing what it was told. x/y/w/h says only where you put it.
 *
 * Units, not pixels, so the board scales with the window without the saved
 * layout going stale — see BOARD_COLS in the dashboard's layout engine.
 */
export interface WidgetPlacement {
  /** Which widget this is. Also its identity on the board: one of each. */
  key: string;
  enabled: boolean;
  /** Grid units from the left edge. */
  x: number;
  /** Grid units from the top. */
  y: number;
  /** Width in grid units. */
  w: number;
  /** Height in grid units. */
  h: number;
}

/**
 * Light, dark, or whatever the device says.
 *
 * "system" is not a synonym for light — it follows the machine, so a phone that
 * dims itself in the evening dims this with it. It is the default because a
 * preference nobody has expressed is best answered by the one they already
 * expressed to their operating system.
 */
export type Theme = "light" | "dark" | "system";

export interface Settings {
  displayName: string;
  density: Density;
  accent: AccentVariant;
  theme: Theme;
  defaultCalView: CalView;
  navLayout: NavLayout;
  weekStartsOn: WeekStart;
  assistantTone: AssistantTone;
  assistantLength: AssistantLength;
  /** Free text the client writes for the assistant. Capped at 600 chars. */
  assistantNotes: string;
  /** Size is optional on read for rows written before it existed. */
  widgets: WidgetPlacement[];
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
