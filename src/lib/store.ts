import { useCallback, useSyncExternalStore } from "react";

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

const STORAGE_KEY = "grounded.v1";

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function seed(): AppState {
  const proj1: Project = {
    id: "proj-progression",
    name: "Progression State",
    status: "active",
    description: "Ongoing career progression work",
    subprojects: [
      { id: "sub-nce", name: "NCE", description: "Prep and coursework for NCE" },
      { id: "sub-portfolio", name: "Portfolio refresh" },
    ],
  };
  const proj2: Project = {
    id: "proj-civiq",
    name: "CultivateIQ",
    status: "paused",
    description: "Passion project — currently on pause",
    subprojects: [{ id: "sub-civiq-scope", name: "Scope & vision" }],
  };

  const habits: Habit[] = [
    { id: "h-walk", name: "Walk outside", createdAt: Date.now(), log: {} },
    { id: "h-journal", name: "Journal", createdAt: Date.now(), log: {} },
    { id: "h-bed", name: "Make my bed", createdAt: Date.now(), log: {} },
  ];
  // seed some past completion dots
  for (let i = 1; i < 14; i++) {
    const d = daysAgo(i);
    if (i % 2 === 0) habits[0].log[d] = true;
    if (i % 3 !== 0) habits[1].log[d] = true;
    if (i % 4 !== 0) habits[2].log[d] = true;
  }

  const goals: Goal[] = [
    { id: uid(), area: "personal", name: "Improve self-confidence", description: "Small daily wins and gentle self-talk", progress: 35 },
    { id: uid(), area: "personal", name: "Walk consistently", description: "Aim for 4 walks a week", progress: 55 },
    { id: uid(), area: "personal", name: "Better mental health", description: "Journaling + therapy check-ins", progress: 40 },
    { id: uid(), area: "professional", name: "Pass NCE", description: "Study plan across 8 weeks", progress: 25, projectId: proj1.id, subprojectId: "sub-nce" },
    { id: uid(), area: "professional", name: "Refresh portfolio", progress: 10, projectId: proj1.id, subprojectId: "sub-portfolio" },
    { id: uid(), area: "professional", name: "Define CultivateIQ v2 vision", progress: 15, projectId: proj2.id, subprojectId: "sub-civiq-scope" },
    { id: uid(), area: "education", name: "Prep for MSBA at Georgetown", description: "Refresh stats & Python before Aug 3", progress: 20 },
  ];

  const tasks: Task[] = [
    { id: uid(), area: "personal", title: "20-minute walk", date: today(), done: false, createdAt: Date.now() },
    { id: uid(), area: "personal", title: "Evening journal entry", date: today(), done: false, createdAt: Date.now() },
    { id: uid(), area: "personal", title: "Call a friend", date: daysAhead(2), done: false, createdAt: Date.now() },
    { id: uid(), area: "professional", title: "NCE — chapter 3 review", date: daysAgo(1), done: false, createdAt: Date.now(), projectId: proj1.id, subprojectId: "sub-nce" },
    { id: uid(), area: "professional", title: "Update resume bullets", date: daysAhead(3), done: false, createdAt: Date.now(), projectId: proj1.id, subprojectId: "sub-portfolio" },
    { id: uid(), area: "professional", title: "Draft CultivateIQ one-pager", date: daysAhead(14), done: false, createdAt: Date.now(), projectId: proj2.id, subprojectId: "sub-civiq-scope" },
    { id: uid(), area: "education", title: "Refresh Python: pandas basics", date: today(), done: false, createdAt: Date.now() },
    { id: uid(), area: "education", title: "Georgetown pre-reading: chapter 1", date: daysAhead(5), done: false, createdAt: Date.now() },
    { id: uid(), area: "education", title: "Stats review: distributions", date: daysAgo(2), done: true, createdAt: Date.now() },
  ];

  const events: CalEvent[] = [
    { id: uid(), title: "Therapy session", date: daysAhead(1), area: "personal" },
    { id: uid(), title: "1:1 with mentor", date: daysAhead(4), area: "professional" },
    { id: uid(), title: "Georgetown orientation prep call", date: daysAhead(10), area: "education" },
  ];

  const focusSessions: FocusSession[] = [
    { id: uid(), label: "Stats review", minutes: 25, completedAt: Date.now() - 86400000 },
    { id: uid(), label: "Python practice", minutes: 25, completedAt: Date.now() - 86400000 * 2 },
  ];

  const settings: Settings = {
    displayName: "friend",
    density: "comfy",
    accent: "sage",
    defaultCalView: "week",
    widgets: [
      { key: "greeting", enabled: true },
      { key: "tasks", enabled: true },
      { key: "goals", enabled: true },
      { key: "chart", enabled: true },
      { key: "calendar", enabled: true },
      { key: "upcoming", enabled: true },
    ],
  };

  return {
    tasks,
    habits,
    goals,
    projects: [proj1, proj2],
    events,
    focusSessions,
    settings,
  };
}

let state: AppState = load();
const listeners = new Set<() => void>();

function load(): AppState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as AppState;
  } catch {
    return seed();
  }
}

function persist() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
  schedulePush();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useApp<T>(selector: (s: AppState) => T): T {
  const getSnap = useCallback(() => selector(state), [selector]);
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}

export function useAppState(): AppState {
  return useApp((s) => s);
}

// ---------- cloud sync ----------
export type SyncStatus = "local" | "syncing" | "synced" | "error";

let cloudUserId: string | null = null;
let syncStatus: SyncStatus = "local";
const syncListeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function setSyncStatus(s: SyncStatus) {
  syncStatus = s;
  syncListeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => syncStatus,
    () => "local" as SyncStatus,
  );
}

function schedulePush() {
  if (!cloudUserId || typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 600);
}

async function pushNow() {
  if (!cloudUserId) return;
  setSyncStatus("syncing");
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase
      .from("grounded_state")
      .upsert({ user_id: cloudUserId, data: state as unknown as never }, { onConflict: "user_id" });
    if (error) throw error;
    setSyncStatus("synced");
  } catch {
    setSyncStatus("error");
  }
}

function replaceState(next: AppState) {
  state = { ...seed(), ...next, settings: { ...seed().settings, ...(next.settings ?? {}) } };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

/** Called when a user signs in: pulls their cloud data, or migrates local data up on first sign-in. */
export async function connectCloud(userId: string) {
  cloudUserId = userId;
  setSyncStatus("syncing");
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("grounded_state")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data?.data && Object.keys(data.data as object).length > 0) {
      replaceState(data.data as unknown as AppState);
      setSyncStatus("synced");
    } else {
      // First sign-in — migrate whatever is stored locally into the cloud.
      await pushNow();
    }
  } catch {
    setSyncStatus("error");
  }
}

export function disconnectCloud() {
  cloudUserId = null;
  if (pushTimer) clearTimeout(pushTimer);
  setSyncStatus("local");
}



// ---------- actions ----------
export const actions = {
  addTask(input: Omit<Task, "id" | "done" | "createdAt">) {
    state = { ...state, tasks: [...state.tasks, { ...input, id: uid(), done: false, createdAt: Date.now() }] };
    persist();
  },
  toggleTask(id: string) {
    state = { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) };
    persist();
  },
  deleteTask(id: string) {
    state = { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
    persist();
  },
  updateTask(id: string, patch: Partial<Task>) {
    state = { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
    persist();
  },

  addHabit(name: string) {
    state = { ...state, habits: [...state.habits, { id: uid(), name, createdAt: Date.now(), log: {} }] };
    persist();
  },
  deleteHabit(id: string) {
    state = { ...state, habits: state.habits.filter((h) => h.id !== id) };
    persist();
  },
  toggleHabit(id: string, date: string) {
    state = {
      ...state,
      habits: state.habits.map((h) =>
        h.id === id ? { ...h, log: { ...h.log, [date]: !h.log[date] } } : h,
      ),
    };
    persist();
  },

  addGoal(input: Omit<Goal, "id" | "progress"> & { progress?: number }) {
    state = { ...state, goals: [...state.goals, { ...input, id: uid(), progress: input.progress ?? 0 }] };
    persist();
  },
  updateGoal(id: string, patch: Partial<Goal>) {
    state = { ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
    persist();
  },
  deleteGoal(id: string) {
    state = { ...state, goals: state.goals.filter((g) => g.id !== id) };
    persist();
  },

  addProject(name: string, description?: string) {
    state = { ...state, projects: [...state.projects, { id: uid(), name, description, status: "active", subprojects: [] }] };
    persist();
  },
  updateProject(id: string, patch: Partial<Project>) {
    state = { ...state, projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    persist();
  },
  deleteProject(id: string) {
    state = {
      ...state,
      projects: state.projects.filter((p) => p.id !== id),
      tasks: state.tasks.filter((t) => t.projectId !== id),
      goals: state.goals.filter((g) => g.projectId !== id),
    };
    persist();
  },
  addSubproject(projectId: string, name: string) {
    state = {
      ...state,
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, subprojects: [...p.subprojects, { id: uid(), name }] } : p,
      ),
    };
    persist();
  },
  deleteSubproject(projectId: string, subId: string) {
    state = {
      ...state,
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, subprojects: p.subprojects.filter((s) => s.id !== subId) } : p,
      ),
      tasks: state.tasks.filter((t) => !(t.projectId === projectId && t.subprojectId === subId)),
      goals: state.goals.filter((g) => !(g.projectId === projectId && g.subprojectId === subId)),
    };
    persist();
  },

  addEvent(input: Omit<CalEvent, "id">) {
    state = { ...state, events: [...state.events, { ...input, id: uid() }] };
    persist();
  },
  updateEvent(id: string, patch: Partial<CalEvent>) {
    state = { ...state, events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    persist();
  },
  deleteEvent(id: string) {
    state = { ...state, events: state.events.filter((e) => e.id !== id) };
    persist();
  },

  logFocus(label: string, minutes: number) {
    state = { ...state, focusSessions: [{ id: uid(), label, minutes, completedAt: Date.now() }, ...state.focusSessions] };
    persist();
  },

  updateSettings(patch: Partial<Settings>) {
    state = { ...state, settings: { ...state.settings, ...patch } };
    persist();
  },
  reorderWidgets(widgets: Settings["widgets"]) {
    state = { ...state, settings: { ...state.settings, widgets } };
    persist();
  },
};

// ---------- helpers ----------
export const AREA_META: Record<Area, { label: string; color: string; bg: string; text: string; ring: string }> = {
  personal: { label: "Personal", color: "sage", bg: "bg-sage-soft", text: "text-sage-deep", ring: "ring-sage" },
  professional: { label: "Professional", color: "brown", bg: "bg-brown-soft", text: "text-[color:var(--brown)]", ring: "ring-[color:var(--brown)]" },
  education: { label: "Education", color: "clay", bg: "bg-clay-soft", text: "text-[color:var(--clay)]", ring: "ring-[color:var(--clay)]" },
};

export function todayISO() {
  return today();
}
