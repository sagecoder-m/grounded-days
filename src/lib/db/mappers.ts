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
  CalEvent,
  Density,
  AccentVariant,
  CalView,
  FocusSession,
  Goal,
  Habit,
  Project,
  Settings,
  Subproject,
  Task,
} from "@/lib/store-types";

/** Habits as cached: completions are a separate query, joined in by the facade. */
export type HabitBase = Omit<Habit, "log">;
/** Projects as cached: subprojects are a separate query, nested in by the facade. */
export type ProjectBase = Omit<Project, "subprojects">;
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
    projectId: row.project_id ?? undefined,
    subprojectId: row.subproject_id ?? undefined,
  };
}

export function rowToGoal(row: Tables<"goals">): Goal {
  return {
    id: row.id,
    area: toArea(row.area),
    name: row.name,
    description: row.description ?? undefined,
    progress: row.progress,
    projectId: row.project_id ?? undefined,
    subprojectId: row.subproject_id ?? undefined,
  };
}

export function rowToHabit(row: Tables<"habits">): HabitBase {
  return { id: row.id, name: row.name, createdAt: toEpoch(row.created_at) };
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
    area: toOptionalArea(row.area),
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

export const DEFAULT_WIDGETS: Settings["widgets"] = [
  { key: "greeting", enabled: true },
  { key: "tasks", enabled: true },
  { key: "goals", enabled: true },
  { key: "chart", enabled: true },
  { key: "calendar", enabled: true },
  { key: "upcoming", enabled: true },
];

export const DEFAULT_SETTINGS: Settings = {
  displayName: "friend",
  density: "comfy",
  accent: "sage",
  defaultCalView: "week",
  widgets: DEFAULT_WIDGETS,
};

/** widgets is jsonb, so it arrives as unknown-shaped Json and needs coercing. */
function toWidgets(value: unknown): Settings["widgets"] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;
  const cleaned = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { key, enabled } = entry as { key?: unknown; enabled?: unknown };
    if (typeof key !== "string") return [];
    return [{ key, enabled: enabled !== false }];
  });
  return cleaned.length > 0 ? cleaned : DEFAULT_WIDGETS;
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
    defaultCalView: oneOf<CalView>(["week", "month", "year"], row.default_cal_view, "week"),
    widgets: toWidgets(row.widgets),
  };
}

/** Widgets is a jsonb column, so the array needs widening to Json. */
export function widgetsToJson(widgets: Settings["widgets"]): Json {
  return widgets.map((w) => ({ key: w.key, enabled: w.enabled }));
}

/** Partial domain settings -> partial column patch. */
export function settingsPatchToRow(patch: Partial<Settings>): TablesUpdate<"user_settings"> {
  const row: TablesUpdate<"user_settings"> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.density !== undefined) row.density = patch.density;
  if (patch.accent !== undefined) row.accent = patch.accent;
  if (patch.defaultCalView !== undefined) row.default_cal_view = patch.defaultCalView;
  if (patch.widgets !== undefined) row.widgets = widgetsToJson(patch.widgets);
  return row;
}

// -------------------------------------------------------------- to row patch

export function taskPatchToRow(patch: Partial<Task>): TablesUpdate<"tasks"> {
  const row: TablesUpdate<"tasks"> = {};
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.date !== undefined) row.date = patch.date ?? null;
  if (patch.done !== undefined) row.done = patch.done;
  if (patch.projectId !== undefined) row.project_id = patch.projectId ?? null;
  if (patch.subprojectId !== undefined) row.subproject_id = patch.subprojectId ?? null;
  return row;
}

export function goalPatchToRow(patch: Partial<Goal>): TablesUpdate<"goals"> {
  const row: TablesUpdate<"goals"> = {};
  if (patch.area !== undefined) row.area = patch.area;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.progress !== undefined) row.progress = patch.progress;
  if (patch.projectId !== undefined) row.project_id = patch.projectId ?? null;
  if (patch.subprojectId !== undefined) row.subproject_id = patch.subprojectId ?? null;
  return row;
}

export function projectPatchToRow(patch: Partial<Project>): TablesUpdate<"projects"> {
  const row: TablesUpdate<"projects"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

export function subprojectPatchToRow(patch: Partial<Subproject>): TablesUpdate<"subprojects"> {
  const row: TablesUpdate<"subprojects"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  return row;
}

export function eventPatchToRow(patch: Partial<CalEvent>): TablesUpdate<"events"> {
  const row: TablesUpdate<"events"> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.date !== undefined) row.date = patch.date;
  if (patch.area !== undefined) row.area = patch.area ?? null;
  return row;
}
