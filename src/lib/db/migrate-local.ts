/**
 * One-time import of the old localStorage blob into the relational tables.
 *
 * The SQL migration handles blobs that already reached `grounded_state`, but the
 * old store only pushed to the cloud on first sign-in — so a device that never
 * signed in has its data ONLY in localStorage. This covers that case.
 *
 * Guarded twice: a marker key, and a check that the account is genuinely empty.
 * The emptiness check is the important one, because it makes the import
 * impossible to run on top of data the SQL migration already produced.
 */
import { supabase } from "@/integrations/supabase/client";

const LEGACY_KEY = "grounded.v1";
const MARKER_KEY = "grounded.migrated.v2";

interface LegacyBlob {
  tasks?: unknown[];
  habits?: unknown[];
  goals?: unknown[];
  projects?: unknown[];
  events?: unknown[];
  focusSessions?: unknown[];
  settings?: Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const AREAS = ["personal", "professional", "education"];
const area = (v: unknown, fallback: string | null): string | null =>
  typeof v === "string" && AREAS.includes(v) ? v : fallback;
const iso = (v: unknown): string | null => {
  const ms = num(v);
  return ms === null ? null : new Date(ms).toISOString();
};

function readLegacyBlob(): LegacyBlob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as LegacyBlob) : null;
  } catch {
    return null;
  }
}

async function accountIsEmpty(): Promise<boolean> {
  const probes = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }),
    supabase.from("goals").select("id", { count: "exact", head: true }),
    supabase.from("habits").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);
  // A failed probe means "don't risk it".
  if (probes.some((p) => p.error)) return false;
  return probes.every((p) => (p.count ?? 0) === 0);
}

/**
 * Imports the legacy blob if one exists and the account has no rows yet.
 * Returns the number of top-level records written, or 0 when it did nothing.
 */
export async function importLocalBlobIfNeeded(userId: string): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (window.localStorage.getItem(MARKER_KEY)) return 0;

  const blob = readLegacyBlob();
  if (!blob) return 0;
  if (!(await accountIsEmpty())) {
    // Nothing to do, but don't keep re-probing on every unlock.
    window.localStorage.setItem(MARKER_KEY, new Date().toISOString());
    return 0;
  }

  let written = 0;
  const arr = (v: unknown[] | undefined) => (Array.isArray(v) ? v : []);
  const asRecord = (v: unknown) =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

  // Old ids are 8-char random strings; build maps as we insert so the
  // projectId / subprojectId references survive as real UUIDs.
  const projectIds = new Map<string, string>();
  const subprojectIds = new Map<string, string>();
  const habitIds = new Map<string, string>();

  // --- projects + subprojects
  const projectRows: Record<string, unknown>[] = [];
  const subprojectRows: Record<string, unknown>[] = [];
  for (const raw of arr(blob.projects)) {
    const p = asRecord(raw);
    const oldId = str(p?.id);
    if (!p || !oldId) continue;
    const id = crypto.randomUUID();
    projectIds.set(oldId, id);
    const status = ["active", "paused", "done"].includes(String(p.status))
      ? String(p.status)
      : "active";
    projectRows.push({
      id,
      user_id: userId,
      name: str(p.name) ?? "Untitled project",
      description: str(p.description),
      status,
    });
    for (const rawSub of arr(p.subprojects as unknown[] | undefined)) {
      const s = asRecord(rawSub);
      const oldSubId = str(s?.id);
      if (!s || !oldSubId) continue;
      const subId = crypto.randomUUID();
      subprojectIds.set(oldSubId, subId);
      subprojectRows.push({
        id: subId,
        user_id: userId,
        project_id: id,
        name: str(s.name) ?? "Untitled sub-project",
        description: str(s.description),
      });
    }
  }

  // --- habits + logs
  const habitRows: Record<string, unknown>[] = [];
  const habitLogRows: Record<string, unknown>[] = [];
  for (const raw of arr(blob.habits)) {
    const h = asRecord(raw);
    const oldId = str(h?.id);
    if (!h || !oldId) continue;
    const id = crypto.randomUUID();
    habitIds.set(oldId, id);
    habitRows.push({
      id,
      user_id: userId,
      name: str(h.name) ?? "Untitled habit",
      created_at: iso(h.createdAt) ?? new Date().toISOString(),
    });
    const log = asRecord(h.log) ?? {};
    for (const [date, done] of Object.entries(log)) {
      // Explicit `false` entries mean "toggled off" and must not become rows.
      if (done !== true) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      habitLogRows.push({ user_id: userId, habit_id: id, date });
    }
  }

  // --- tasks
  const taskRows = arr(blob.tasks).flatMap((raw) => {
    const t = asRecord(raw);
    if (!t) return [];
    const projectId = projectIds.get(str(t.projectId) ?? "") ?? null;
    const subprojectId = projectId ? (subprojectIds.get(str(t.subprojectId) ?? "") ?? null) : null;
    return [
      {
        user_id: userId,
        area: area(t.area, "personal"),
        title: str(t.title) ?? "Untitled task",
        description: str(t.description),
        date: str(t.date),
        done: t.done === true,
        project_id: projectId,
        subproject_id: subprojectId,
        created_at: iso(t.createdAt) ?? new Date().toISOString(),
      },
    ];
  });

  // --- goals
  const goalRows = arr(blob.goals).flatMap((raw) => {
    const g = asRecord(raw);
    if (!g) return [];
    const projectId = projectIds.get(str(g.projectId) ?? "") ?? null;
    const subprojectId = projectId ? (subprojectIds.get(str(g.subprojectId) ?? "") ?? null) : null;
    const progress = Math.min(Math.max(Math.round(num(g.progress) ?? 0), 0), 100);
    return [
      {
        user_id: userId,
        area: area(g.area, "personal"),
        name: str(g.name) ?? "Untitled goal",
        description: str(g.description),
        progress,
        project_id: projectId,
        subproject_id: subprojectId,
      },
    ];
  });

  // --- events
  const eventRows = arr(blob.events).flatMap((raw) => {
    const e = asRecord(raw);
    const date = str(e?.date);
    if (!e || !date) return [];
    return [
      {
        user_id: userId,
        title: str(e.title) ?? "Untitled event",
        date,
        area: area(e.area, null),
      },
    ];
  });

  // --- focus sessions
  const focusRows = arr(blob.focusSessions).flatMap((raw) => {
    const f = asRecord(raw);
    if (!f) return [];
    return [
      {
        user_id: userId,
        label: str(f.label) ?? "Focus session",
        minutes: Math.max(Math.round(num(f.minutes) ?? 25), 1),
        completed_at: iso(f.completedAt) ?? new Date().toISOString(),
      },
    ];
  });

  // --- settings
  const s = blob.settings ?? {};
  const settingsRow = {
    user_id: userId,
    display_name: str(s.displayName) ?? "friend",
    density: ["compact", "comfy"].includes(String(s.density)) ? String(s.density) : "comfy",
    accent: ["sage", "clay", "brown", "tan"].includes(String(s.accent)) ? String(s.accent) : "sage",
    default_cal_view: ["week", "month", "year"].includes(String(s.defaultCalView))
      ? String(s.defaultCalView)
      : "week",
    ...(Array.isArray(s.widgets) && s.widgets.length > 0 ? { widgets: s.widgets } : {}),
  };

  // Insert parents before children so the FKs resolve.
  const steps: [string, Record<string, unknown>[]][] = [
    ["projects", projectRows],
    ["subprojects", subprojectRows],
    ["habits", habitRows],
    ["habit_logs", habitLogRows],
    ["tasks", taskRows],
    ["goals", goalRows],
    ["events", eventRows],
    ["focus_sessions", focusRows],
  ];

  for (const [table, rows] of steps) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table as "tasks").insert(rows as never);
    if (error) {
      // Leave the marker unset so a later attempt can retry, and leave the
      // legacy blob in place as the local backup.
      throw new Error(`Importing ${table} failed: ${error.message}`);
    }
    written += rows.length;
  }

  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert(settingsRow as never, { onConflict: "user_id" });
  if (settingsError) throw new Error(`Importing settings failed: ${settingsError.message}`);

  window.localStorage.setItem(MARKER_KEY, new Date().toISOString());
  return written;
}
