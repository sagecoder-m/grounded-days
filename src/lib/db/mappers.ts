/**
 * Row <-> domain mapping.
 *
 * The domain types (Task, Goal, Habit, ...) are the ones the components already
 * use, so keeping them byte-identical is what lets ~15 consumer files compile
 * unchanged. This file is the only place that knows about snake_case columns,
 * timestamptz strings, or the fact that habit completions live in their own
 * table.
 */
import type { Json, Tables, TablesUpdate } from "@/integrations/supabase/types";
import type {
  Area,
  Course,
  CalendarConnection,
  CalendarProvider,
  CalEvent,
  ConnectionStatus,
  Density,
  AccentVariant,
  CalView,
  NavLayout,
  EventSource,
  FocusSession,
  Goal,
  GoalStep,
  JournalEntry,
  Mood,
  Habit,
  Project,
  AssistantLength,
  AssistantTone,
  Settings,
  Subproject,
  Theme,
  WeekStart,
  Task,
} from "@/lib/store-types";

/** Habits as cached: completions are a separate query, joined in by the facade. */
export type HabitBase = Omit<Habit, "log">;
/** Projects as cached: subprojects are a separate query, nested in by the facade. */
export type ProjectBase = Omit<Project, "subprojects">;
/** Goals as cached: steps are a separate query, joined in by the facade. */
export type GoalBase = Omit<Goal, "steps">;
/** One goal step, carrying its parent so the facade can group them. */
export type GoalStepWithParent = GoalStep & { goalId: string };
/** Subprojects as cached: they carry their parent so the facade can group them. */
export type SubprojectWithParent = Subproject & { projectId: string };
/** One habit completion. Presence of the row IS the completion. */
export interface HabitLogEntry {
  habitId: string;
  date: string;
}

const AREAS = ["personal", "professional", "education"] as const;
const STATUSES = ["active", "paused", "done"] as const;

function toArea(value: string | null): Area {
  return (AREAS as readonly string[]).includes(value ?? "") ? (value as Area) : "personal";
}

/**
 * Projects predate the area column and every existing one is work. Defaulting
 * to professional rather than the generic toArea() fallback of personal means a
 * build that reaches a database without the column behaves exactly as before,
 * instead of silently moving every work project into Personal.
 */
function toProjectArea(value: string | null | undefined): Area {
  return (AREAS as readonly string[]).includes(value ?? "") ? (value as Area) : "professional";
}

function toOptionalArea(value: string | null): Area | undefined {
  return (AREAS as readonly string[]).includes(value ?? "") ? (value as Area) : undefined;
}

/** timestamptz string -> epoch ms, matching the existing createdAt/completedAt. */
function toEpoch(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

// ------------------------------------------------------------------ to domain

export function rowToTask(row: Tables<"tasks">): Task {
  return {
    id: row.id,
    area: toArea(row.area),
    title: row.title,
    description: row.description ?? undefined,
    date: row.date ?? undefined,
    done: row.done,
    createdAt: toEpoch(row.created_at),
    updatedAt: toEpoch(row.updated_at),
    projectId: row.project_id ?? undefined,
    subprojectId: row.subproject_id ?? undefined,
    courseId: row.course_id ?? undefined,
  };
}

export function rowToCourse(row: Tables<"courses">): Course {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? undefined,
    term: row.term ?? undefined,
    position: row.position,
    createdAt: toEpoch(row.created_at),
  };
}

export function rowToGoal(row: Tables<"goals">): GoalBase {
  return {
    id: row.id,
    area: toArea(row.area),
    name: row.name,
    description: row.description ?? undefined,
    progress: row.progress,
    position: row.position,
    targetDate: row.target_date ?? undefined,
    projectId: row.project_id ?? undefined,
    subprojectId: row.subproject_id ?? undefined,
  };
}

export function rowToGoalStep(row: Tables<"goal_steps">): GoalStepWithParent {
  return { id: row.id, title: row.title, done: row.done, goalId: row.goal_id };
}

export function rowToHabit(row: Tables<"habits">): HabitBase {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: toEpoch(row.created_at),
    goalId: row.goal_id ?? undefined,
  };
}

export function rowToHabitLog(row: Tables<"habit_logs">): HabitLogEntry {
  return { habitId: row.habit_id, date: row.date };
}

export function rowToProject(row: Tables<"projects">): ProjectBase {
  const status = (STATUSES as readonly string[]).includes(row.status)
    ? (row.status as Project["status"])
    : "active";
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status,
    area: toProjectArea(row.area),
    position: row.position,
  };
}

export function rowToSubproject(row: Tables<"subprojects">): SubprojectWithParent {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    projectId: row.project_id,
  };
}

export function rowToEvent(row: Tables<"events">): CalEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date ?? undefined,
    area: toOptionalArea(row.area),
    source: toEventSource(row.source),
    connectionId: row.connection_id ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    allDay: row.all_day,
    location: row.location ?? undefined,
    htmlLink: row.html_link ?? undefined,
  };
}

const EVENT_SOURCES = ["local", "google", "microsoft", "ical"] as const;

/** Unknown values fall back to "local" only for reads; nothing writes them. */
function toEventSource(value: string | null): EventSource {
  return (EVENT_SOURCES as readonly string[]).includes(value ?? "")
    ? (value as EventSource)
    : "local";
}

export function rowToCalendarConnection(row: Tables<"calendar_connections">): CalendarConnection {
  return {
    id: row.id,
    provider: row.provider as CalendarProvider,
    accountEmail: row.account_email ?? undefined,
    feedUrl: row.feed_url ?? undefined,
    defaultArea: toOptionalArea(row.default_area),
    status: row.status as ConnectionStatus,
    statusDetail: row.status_detail ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

const MOODS = ["low", "tender", "steady", "good", "wired"] as const;

export function rowToJournalEntry(row: Tables<"journal_entries">): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    body: row.body,
    mood: (MOODS as readonly string[]).includes(row.mood ?? "") ? (row.mood as Mood) : undefined,
    gratitude: row.gratitude ?? undefined,
  };
}

export function rowToFocusSession(row: Tables<"focus_sessions">): FocusSession {
  return {
    id: row.id,
    label: row.label,
    minutes: row.minutes,
    completedAt: toEpoch(row.completed_at),
  };
}

// ------------------------------------------------------------------- settings

/**
 * The board as it arrives before anyone has arranged it.
 *
 * Grid units on a 36-column board: 12 is a third, 18 a half, 36 the width.
 * Five on, five off — turning one on is easier than evaluating ten before you
 * have used any of them.
 *
 * The arrangement is the one that was asked for: the greeting across the top,
 * the two lists side by side beneath it, and the timer above the river in the
 * third column. It is a starting point, not a rule — every one of these can be
 * dragged anywhere from the first second.
 */
export const DEFAULT_WIDGETS: Settings["widgets"] = [
  // The greeting across the top, the attention chart and Upcoming down the
  // left, the timer over the river in the middle, and the day's list running
  // full height on the right. Grid units on a 36-column board.
  //
  // This is an arrangement that was built by hand on the board and then read
  // back out of it, rather than one guessed at in code — which is why the
  // widths are 15/11/10 and not tidy thirds. It is a starting point, not a
  // rule: every one of these can be dragged and resized from the first second.
  { key: "greeting", enabled: true, x: 0, y: 0, w: 36, h: 5 },
  { key: "balance", enabled: true, x: 0, y: 5, w: 15, h: 9 },
  { key: "focus", enabled: true, x: 15, y: 5, w: 11, h: 7 },
  { key: "day", enabled: true, x: 26, y: 5, w: 10, h: 19 },
  { key: "river", enabled: true, x: 15, y: 12, w: 11, h: 11 },
  { key: "upcoming", enabled: true, x: 0, y: 14, w: 14, h: 19 },
  // Off by default, and parked below everything else so that switching one on
  // in Profile does not drop it on top of something. Adding one from the board
  // gives it a fresh spot underneath anyway (see placeBelow).
  { key: "chart", enabled: false, x: 0, y: 33, w: 36, h: 11 },
  { key: "goals", enabled: false, x: 0, y: 44, w: 18, h: 9 },
  { key: "rhythm", enabled: false, x: 18, y: 44, w: 18, h: 9 },
  { key: "movement", enabled: false, x: 0, y: 53, w: 18, h: 9 },
];

const DEFAULT_BY_KEY = new Map(DEFAULT_WIDGETS.map((w) => [w.key, w]));

export const PINNED_WIDGETS = new Set(["greeting"]);

export const DEFAULT_SETTINGS: Settings = {
  displayName: "friend",
  density: "comfy",
  accent: "sage",
  theme: "light",
  defaultCalView: "week",
  navLayout: "sidebar",
  weekStartsOn: 1,
  assistantTone: "gentle",
  assistantLength: "brief",
  assistantNotes: "",
  widgets: DEFAULT_WIDGETS,
};

/**
 * widgets is jsonb, so it arrives as unknown-shaped Json and needs coercing.
 *
 * Two jobs. Anything in DEFAULT_WIDGETS the stored array does not mention is
 * appended, which is what makes a new widget reach accounts that already exist
 * — without it, a widget added after your row was written never appears for
 * you, not even switched off, and each one needs a hand-written UPDATE that
 * only reaches rows existing the moment it runs.
 *
 * The other job is the shape change. Rows still carry one of the old named
 * sizes ("long", "tall", "square", "wide", "third"...) instead of x/y/w/h,
 * because a settings row is only rewritten when someone changes something. A
 * name cannot say where a widget sits, so there is nothing to convert it into
 * — such a row is given the default arrangement for that widget and becomes a
 * real placement the first time it is dragged. This is permanent, not a
 * migration step.
 */
function toWidgets(value: unknown): Settings["widgets"] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;

  const cleaned = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== "string") return [];
    const fallback = DEFAULT_BY_KEY.get(e.key);
    // A widget nobody has a default for is one that has been retired. Dropped
    // rather than kept, since there is nothing left to render for it.
    if (!fallback) return [];
    const num = (v: unknown, or: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : or;
    /*
      Pinned furniture is read from the defaults and not from the row at all.

      Not defensiveness for its own sake: a stored position for the header was
      reachable in practice. A drag that pushed its neighbours aside could
      displace it, and the displaced position was then saved — so the greeting
      ended up halfway down the board, under a chart and a timer, with no
      control anywhere to put it back. Whatever a row says about it now, the
      header is at the top, full width.
    */
    if (PINNED_WIDGETS.has(e.key)) return [{ ...fallback, enabled: true }];

    return [
      {
        key: e.key,
        enabled: e.enabled !== false,
        x: num(e.x, fallback.x),
        y: num(e.y, fallback.y),
        // Zero would be a tile with no area, so a stored 0 falls back too.
        w: Math.max(1, num(e.w, fallback.w)),
        h: Math.max(1, num(e.h, fallback.h)),
      },
    ];
  });
  if (cleaned.length === 0) return DEFAULT_WIDGETS;

  const present = new Set(cleaned.map((w) => w.key));
  return [...cleaned, ...DEFAULT_WIDGETS.filter((w) => !present.has(w.key))];
}

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function rowToSettings(row: Tables<"user_settings"> | null): Settings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    displayName: row.display_name,
    density: oneOf<Density>(["compact", "comfy"], row.density, "comfy"),
    accent: oneOf<AccentVariant>(["sage", "clay", "brown", "tan"], row.accent, "sage"),
    // Rows written before the column existed read as null through the client,
    // NOT NULL default notwithstanding — same case as week_starts_on.
    // Light, not system. A row written before this column existed reads as null
    // through the client despite the NOT NULL default, and the app's own
    // default is light — falling back to "system" put those accounts on
    // whatever their machine happened to be set to.
    theme: oneOf<Theme>(["light", "dark", "system"], row.theme, "light"),
    defaultCalView: oneOf<CalView>(["week", "month", "year"], row.default_cal_view, "week"),
    navLayout: oneOf<NavLayout>(["sidebar", "top"], row.nav_layout, "sidebar"),
    // Numeric rather than a string union, so oneOf() does not apply. A row
    // written before this column existed reads as null through the client even
    // though the column is NOT NULL, hence the fallback rather than a cast.
    weekStartsOn: ([0, 1, 6] as const).includes(row.week_starts_on as WeekStart)
      ? (row.week_starts_on as WeekStart)
      : 1,
    assistantTone: oneOf<AssistantTone>(
      ["gentle", "neutral", "direct"],
      row.assistant_tone,
      "gentle",
    ),
    assistantLength: oneOf<AssistantLength>(
      ["brief", "balanced", "thorough"],
      row.assistant_length,
      "brief",
    ),
    assistantNotes: (row.assistant_notes ?? "").slice(0, 600),
    widgets: toWidgets(row.widgets),
  };
}

/** Widgets is a jsonb column, so the array needs widening to Json. */
export function widgetsToJson(widgets: Settings["widgets"]): Json {
  return widgets.map((w) => ({
    key: w.key,
    enabled: w.enabled,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }));
}

/** Partial domain settings -> partial column patch. */
export function settingsPatchToRow(patch: Partial<Settings>): TablesUpdate<"user_settings"> {
  const row: TablesUpdate<"user_settings"> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.density !== undefined) row.density = patch.density;
  if (patch.accent !== undefined) row.accent = patch.accent;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.defaultCalView !== undefined) row.default_cal_view = patch.defaultCalView;
  if (patch.navLayout !== undefined) row.nav_layout = patch.navLayout;
  if (patch.weekStartsOn !== undefined) row.week_starts_on = patch.weekStartsOn;
  if (patch.assistantTone !== undefined) row.assistant_tone = patch.assistantTone;
  if (patch.assistantLength !== undefined) row.assistant_length = patch.assistantLength;
  if (patch.assistantNotes !== undefined) row.assistant_notes = patch.assistantNotes.slice(0, 600);
  if (patch.widgets !== undefined) row.widgets = widgetsToJson(patch.widgets);
  return row;
}

// -------------------------------------------------------------- to row patch

/*
 * On `"field" in patch` rather than `patch.field !== undefined`.
 *
 * Every guard below whose body ends in `?? null` exists so a value can be
 * cleared. With a !== undefined guard that branch was unreachable: the domain
 * types use undefined for absence, never null, so `patch.date ?? null` could
 * only ever fire for a null nobody passes — and passing undefined skipped the
 * assignment entirely. Clearing a due date, a description or a goal's target
 * silently did nothing, with no error anywhere.
 *
 * `in` distinguishes the two cases the code always meant to distinguish: a key
 * that is absent (leave the column alone) from a key explicitly set to undefined
 * (write null). Guards without `?? null` keep the old form, because for a NOT
 * NULL column an undefined should be ignored rather than rejected by Postgres.
 */

export function taskPatchToRow(patch: Partial<Task>): TablesUpdate<"tasks"> {
  const row: TablesUpdate<"tasks"> = {};
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.title !== undefined) row.title = patch.title;
  if ("description" in patch) row.description = patch.description ?? null;
  if ("courseId" in patch) row.course_id = patch.courseId ?? null;
  if ("date" in patch) row.date = patch.date ?? null;
  if (patch.done !== undefined) row.done = patch.done;
  if ("projectId" in patch) row.project_id = patch.projectId ?? null;
  if ("subprojectId" in patch) row.subproject_id = patch.subprojectId ?? null;
  return row;
}

export function goalPatchToRow(patch: Partial<Goal>): TablesUpdate<"goals"> {
  const row: TablesUpdate<"goals"> = {};
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.name !== undefined) row.name = patch.name;
  if ("description" in patch) row.description = patch.description ?? null;
  // progress stays writable for goals that have no steps yet; once a goal has
  // steps its percentage is derived and nothing writes this column.
  if (patch.progress !== undefined) row.progress = patch.progress;
  // Explicit null on clear, so removing a target date actually removes it rather
  // than being dropped as "no change".
  if ("targetDate" in patch) row.target_date = patch.targetDate ?? null;
  if ("projectId" in patch) row.project_id = patch.projectId ?? null;
  if ("subprojectId" in patch) row.subproject_id = patch.subprojectId ?? null;
  return row;
}

export function projectPatchToRow(patch: Partial<Project>): TablesUpdate<"projects"> {
  const row: TablesUpdate<"projects"> = {};
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.name !== undefined) row.name = patch.name;
  if ("description" in patch) row.description = patch.description ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

export function subprojectPatchToRow(patch: Partial<Subproject>): TablesUpdate<"subprojects"> {
  const row: TablesUpdate<"subprojects"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if ("description" in patch) row.description = patch.description ?? null;
  return row;
}

export function eventPatchToRow(patch: Partial<CalEvent>): TablesUpdate<"events"> {
  const row: TablesUpdate<"events"> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.date !== undefined) row.date = patch.date;
  if ("endDate" in patch) row.end_date = patch.endDate ?? null;
  if ("area" in patch) row.area = patch.area ?? null;
  // Rescheduling moves the timestamps too. Without these a dragged event would
  // save its new date while starts_at still pointed at the old day, and the
  // board (which filters on date) would disagree with the day view (which
  // sorts on starts_at).
  if ("startsAt" in patch) row.starts_at = patch.startsAt ?? null;
  if ("endsAt" in patch) row.ends_at = patch.endsAt ?? null;
  return row;
}
