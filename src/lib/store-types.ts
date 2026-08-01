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

export interface Goal {
  id: string;
  area: Area;
  name: string;
  description?: string;
  progress: number; // 0..100
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
  subprojects: Subproject[];
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // ISO
  area?: Area;
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

export interface Settings {
  displayName: string;
  density: Density;
  accent: AccentVariant;
  defaultCalView: CalView;
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
