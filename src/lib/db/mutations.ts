/**
 * The write path.
 *
 * Every action optimistically patches the React Query cache, fires the Supabase
 * write, rolls the cache back if it fails, and invalidates on success. Call
 * sites stay fire-and-forget (nothing awaits an action), which is what lets the
 * ~38 existing `actions.*` calls keep working after the move to async storage.
 *
 * Failures surface as a gentle toast rather than an exception, matching the
 * app's voice and the fact that no call site has error handling.
 */
import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  Area,
  CalendarConnection,
  CalendarProvider,
  CalEvent,
  Goal,
  Project,
  Settings,
  Subproject,
  Task,
} from "@/lib/store-types";
import { requireStoreContext, peekStoreContext } from "./context";
import { qk } from "./keys";
import {
  DEFAULT_SETTINGS,
  eventPatchToRow,
  goalPatchToRow,
  projectPatchToRow,
  settingsPatchToRow,
  subprojectPatchToRow,
  taskPatchToRow,
  widgetsToJson,
  type HabitBase,
  type HabitLogEntry,
  type ProjectBase,
  type SubprojectWithParent,
} from "./mappers";

const uuid = () => crypto.randomUUID();

/** Tracks whether the most recent write failed, for the sidebar indicator. */
let lastWriteFailed = false;
const failureListeners = new Set<() => void>();

export function subscribeToWriteFailures(listener: () => void) {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function hasWriteFailure() {
  return lastWriteFailed;
}

function setWriteFailed(failed: boolean) {
  if (lastWriteFailed === failed) return;
  lastWriteFailed = failed;
  failureListeners.forEach((l) => l());
}

/**
 * Supabase query builders are thenable but not real Promises, so the write
 * callback is typed as PromiseLike rather than Promise.
 */
type WriteResult = PromiseLike<{ error: { message: string } | null }>;

/**
 * Optimistically patch one or more cache entries, run the write, roll back on
 * failure. `patches` is a list so cascading deletes can update every affected
 * collection in one atomic-feeling step.
 */
async function write(
  patches: { key: QueryKey; update: (prev: never) => unknown }[],
  run: () => WriteResult,
  /**
   * Extra keys to refetch on success, for writes whose side effects happen in
   * the database rather than in the patched caches — a delete that cascades,
   * for instance, leaves other collections stale with nothing to patch locally.
   */
  options?: { alsoInvalidate?: QueryKey[] },
) {
  const ctx = peekStoreContext();
  if (!ctx) return;
  const { queryClient } = ctx;

  const snapshots = patches.map(({ key }) => ({
    key,
    previous: queryClient.getQueryData(key),
  }));

  for (const { key, update } of patches) {
    queryClient.setQueryData(key, (prev: never) => update(prev));
  }

  try {
    const { error } = await run();
    if (error) throw new Error(error.message);
    setWriteFailed(false);
  } catch (err) {
    for (const { key, previous } of snapshots) {
      queryClient.setQueryData(key, previous);
    }
    setWriteFailed(true);
    toast.error("That didn't save", {
      description: err instanceof Error ? err.message : "Try again in a moment.",
    });
    return;
  }

  for (const { key } of patches) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
  for (const key of options?.alsoInvalidate ?? []) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Helpers for the common list-shaped cache updates. */
const listAdd =
  <T>(item: T) =>
  (prev: T[] | undefined) => [...(prev ?? []), item];

const listRemove =
  <T extends { id: string }>(id: string) =>
  (prev: T[] | undefined) =>
    (prev ?? []).filter((row) => row.id !== id);

const listPatch =
  <T extends { id: string }>(id: string, patch: Partial<T>) =>
  (prev: T[] | undefined) =>
    (prev ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row));

export const actions = {
  // ------------------------------------------------------------------- tasks

  addTask(input: Omit<Task, "id" | "done" | "createdAt">) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: Task = { ...input, id, done: false, createdAt: Date.now() };
    void write([{ key: qk.tasks(userId), update: listAdd(optimistic) }], () =>
      supabase.from("tasks").insert({
        id,
        user_id: userId,
        area: input.area,
        title: input.title,
        description: input.description ?? null,
        date: input.date ?? null,
        done: false,
        project_id: input.projectId ?? null,
        subproject_id: input.subprojectId ?? null,
      }),
    );
  },

  toggleTask(id: string) {
    const { userId, queryClient } = requireStoreContext();
    const current = (queryClient.getQueryData(qk.tasks(userId)) as Task[] | undefined)?.find(
      (t) => t.id === id,
    );
    const next = !(current?.done ?? false);
    void write([{ key: qk.tasks(userId), update: listPatch<Task>(id, { done: next }) }], () =>
      supabase.from("tasks").update({ done: next }).eq("id", id),
    );
  },

  deleteTask(id: string) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.tasks(userId), update: listRemove<Task>(id) }], () =>
      supabase.from("tasks").delete().eq("id", id),
    );
  },

  updateTask(id: string, patch: Partial<Task>) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.tasks(userId), update: listPatch<Task>(id, patch) }], () =>
      supabase.from("tasks").update(taskPatchToRow(patch)).eq("id", id),
    );
  },

  // ------------------------------------------------------------------ habits

  addHabit(name: string) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: HabitBase = { id, name, createdAt: Date.now() };
    void write([{ key: qk.habits(userId), update: listAdd(optimistic) }], () =>
      supabase.from("habits").insert({ id, user_id: userId, name }),
    );
  },

  updateHabit(id: string, patch: Partial<{ name: string }>) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.habits(userId), update: listPatch<HabitBase>(id, patch) }], () =>
      supabase.from("habits").update({ name: patch.name }).eq("id", id),
    );
  },

  deleteHabit(id: string) {
    const { userId } = requireStoreContext();
    void write(
      [
        { key: qk.habits(userId), update: listRemove<HabitBase>(id) },
        {
          key: qk.habitLogs(userId),
          update: (prev: HabitLogEntry[] | undefined) =>
            (prev ?? []).filter((entry) => entry.habitId !== id),
        },
      ],
      () => supabase.from("habits").delete().eq("id", id),
    );
  },

  /**
   * A completion row's presence is the truth, so toggling on upserts and
   * toggling off deletes. ignoreDuplicates + the unique(habit_id, date)
   * constraint make rapid double-taps harmless.
   */
  toggleHabit(id: string, date: string) {
    const { userId, queryClient } = requireStoreContext();
    const logs =
      (queryClient.getQueryData(qk.habitLogs(userId)) as HabitLogEntry[] | undefined) ?? [];
    const isLogged = logs.some((e) => e.habitId === id && e.date === date);

    if (isLogged) {
      void write(
        [
          {
            key: qk.habitLogs(userId),
            update: (prev: HabitLogEntry[] | undefined) =>
              (prev ?? []).filter((e) => !(e.habitId === id && e.date === date)),
          },
        ],
        () => supabase.from("habit_logs").delete().eq("habit_id", id).eq("date", date),
      );
      return;
    }

    void write(
      [
        {
          key: qk.habitLogs(userId),
          update: (prev: HabitLogEntry[] | undefined) => [...(prev ?? []), { habitId: id, date }],
        },
      ],
      () =>
        supabase
          .from("habit_logs")
          .upsert(
            { user_id: userId, habit_id: id, date },
            { onConflict: "habit_id,date", ignoreDuplicates: true },
          ),
    );
  },

  // ------------------------------------------------------------------- goals

  addGoal(input: Omit<Goal, "id" | "progress"> & { progress?: number }) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const progress = input.progress ?? 0;
    const optimistic: Goal = { ...input, id, progress };
    void write([{ key: qk.goals(userId), update: listAdd(optimistic) }], () =>
      supabase.from("goals").insert({
        id,
        user_id: userId,
        area: input.area,
        name: input.name,
        description: input.description ?? null,
        progress,
        project_id: input.projectId ?? null,
        subproject_id: input.subprojectId ?? null,
      }),
    );
  },

  updateGoal(id: string, patch: Partial<Goal>) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.goals(userId), update: listPatch<Goal>(id, patch) }], () =>
      supabase.from("goals").update(goalPatchToRow(patch)).eq("id", id),
    );
  },

  deleteGoal(id: string) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.goals(userId), update: listRemove<Goal>(id) }], () =>
      supabase.from("goals").delete().eq("id", id),
    );
  },

  // ---------------------------------------------------------------- projects

  addProject(name: string, description?: string) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: ProjectBase = { id, name, description, status: "active" };
    void write([{ key: qk.projects(userId), update: listAdd(optimistic) }], () =>
      supabase.from("projects").insert({
        id,
        user_id: userId,
        name,
        description: description ?? null,
        status: "active",
      }),
    );
  },

  updateProject(id: string, patch: Partial<Project>) {
    const { userId } = requireStoreContext();
    const { subprojects: _ignored, ...rest } = patch;
    void write([{ key: qk.projects(userId), update: listPatch<ProjectBase>(id, rest) }], () =>
      supabase.from("projects").update(projectPatchToRow(patch)).eq("id", id),
    );
  },

  /** FK cascades handle the child rows; the cache just mirrors that. */
  deleteProject(id: string) {
    const { userId, queryClient } = requireStoreContext();
    const subs =
      (queryClient.getQueryData(qk.subprojects(userId)) as SubprojectWithParent[] | undefined) ??
      [];
    const doomedSubIds = new Set(subs.filter((s) => s.projectId === id).map((s) => s.id));

    void write(
      [
        { key: qk.projects(userId), update: listRemove<ProjectBase>(id) },
        {
          key: qk.subprojects(userId),
          update: (prev: SubprojectWithParent[] | undefined) =>
            (prev ?? []).filter((s) => s.projectId !== id),
        },
        {
          key: qk.tasks(userId),
          update: (prev: Task[] | undefined) =>
            (prev ?? []).filter(
              (t) => t.projectId !== id && !(t.subprojectId && doomedSubIds.has(t.subprojectId)),
            ),
        },
        {
          key: qk.goals(userId),
          update: (prev: Goal[] | undefined) =>
            (prev ?? []).filter(
              (g) => g.projectId !== id && !(g.subprojectId && doomedSubIds.has(g.subprojectId)),
            ),
        },
      ],
      () => supabase.from("projects").delete().eq("id", id),
    );
  },

  addSubproject(projectId: string, name: string) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: SubprojectWithParent = { id, name, projectId };
    void write([{ key: qk.subprojects(userId), update: listAdd(optimistic) }], () =>
      supabase.from("subprojects").insert({ id, user_id: userId, project_id: projectId, name }),
    );
  },

  updateSubproject(_projectId: string, subId: string, patch: Partial<Subproject>) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.subprojects(userId),
          update: listPatch<SubprojectWithParent>(subId, patch),
        },
      ],
      () => supabase.from("subprojects").update(subprojectPatchToRow(patch)).eq("id", subId),
    );
  },

  deleteSubproject(_projectId: string, subId: string) {
    const { userId } = requireStoreContext();
    void write(
      [
        { key: qk.subprojects(userId), update: listRemove<SubprojectWithParent>(subId) },
        {
          key: qk.tasks(userId),
          update: (prev: Task[] | undefined) =>
            (prev ?? []).filter((t) => t.subprojectId !== subId),
        },
        {
          key: qk.goals(userId),
          update: (prev: Goal[] | undefined) =>
            (prev ?? []).filter((g) => g.subprojectId !== subId),
        },
      ],
      () => supabase.from("subprojects").delete().eq("id", subId),
    );
  },

  // ------------------------------------------------------------------ events

  // Events mirrored from Google/Outlook are read-only. RLS rejects a client
  // write to them outright, so these three only ever handle local events —
  // callers must not offer edit affordances on a synced event.
  addEvent(input: Omit<CalEvent, "id" | "source" | "allDay">) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: CalEvent = { ...input, id, source: "local", allDay: true };
    void write([{ key: qk.events(userId), update: listAdd(optimistic) }], () =>
      supabase.from("events").insert({
        id,
        user_id: userId,
        title: input.title,
        date: input.date,
        area: input.area ?? null,
        source: "local",
        all_day: true,
      }),
    );
  },

  updateEvent(id: string, patch: Partial<CalEvent>) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.events(userId), update: listPatch<CalEvent>(id, patch) }], () =>
      supabase.from("events").update(eventPatchToRow(patch)).eq("id", id).eq("source", "local"),
    );
  },

  deleteEvent(id: string) {
    const { userId } = requireStoreContext();
    void write([{ key: qk.events(userId), update: listRemove<CalEvent>(id) }], () =>
      supabase.from("events").delete().eq("id", id).eq("source", "local"),
    );
  },

  // -------------------------------------------------------- calendar sync

  /** Kick off the OAuth handshake; resolves to the URL to send the browser to. */
  async startCalendarConnect(provider: CalendarProvider, redirectTo = "/profile") {
    const { data, error } = await supabase.functions.invoke("calendar-oauth-start", {
      body: { provider, redirectTo },
    });
    if (error) throw new Error(error.message);
    if (!data?.authorizeUrl) throw new Error("No authorize URL returned");
    return data.authorizeUrl as string;
  },

  /** Pull now. Events land via the sync job, so refetch both collections. */
  async syncCalendarsNow() {
    const { userId, queryClient } = requireStoreContext();
    const { error } = await supabase.functions.invoke("calendar-sync", { body: {} });
    if (error) throw new Error(error.message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.events(userId) }),
      queryClient.invalidateQueries({ queryKey: qk.calendarConnections(userId) }),
    ]);
  },

  /** Removing the connection cascades its mirrored events away in the database. */
  disconnectCalendar(connectionId: string) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.calendarConnections(userId),
          update: listRemove<CalendarConnection>(connectionId),
        },
      ],
      () => supabase.from("calendar_connections").delete().eq("id", connectionId),
      // The cascade happens server-side, so the cached events list is stale
      // until refetched.
      { alsoInvalidate: [qk.events(userId)] },
    );
  },

  setConnectionArea(connectionId: string, area: Area) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.calendarConnections(userId),
          update: listPatch<CalendarConnection>(connectionId, { defaultArea: area }),
        },
      ],
      () =>
        supabase.from("calendar_connections").update({ default_area: area }).eq("id", connectionId),
      { alsoInvalidate: [qk.events(userId)] },
    );
  },

  // ---------------------------------------------------------------- focus

  logFocus(label: string, minutes: number) {
    const { userId } = requireStoreContext();
    const id = uuid();
    const completedAt = Date.now();
    void write(
      [
        {
          key: qk.focusSessions(userId),
          update: (prev: { id: string }[] | undefined) => [
            { id, label, minutes, completedAt },
            ...(prev ?? []),
          ],
        },
      ],
      () =>
        supabase.from("focus_sessions").insert({
          id,
          user_id: userId,
          label,
          minutes,
          completed_at: new Date(completedAt).toISOString(),
        }),
    );
  },

  // --------------------------------------------------------------- settings
  // Upsert rather than update: a brand-new account has no settings row until
  // the first preference change.

  updateSettings(patch: Partial<Settings>) {
    const { userId, queryClient } = requireStoreContext();
    const current =
      (queryClient.getQueryData(qk.settings(userId)) as Settings | undefined) ?? DEFAULT_SETTINGS;
    const next: Settings = { ...current, ...patch };
    void write([{ key: qk.settings(userId), update: () => next }], () =>
      supabase.from("user_settings").upsert(
        {
          user_id: userId,
          display_name: next.displayName,
          density: next.density,
          accent: next.accent,
          default_cal_view: next.defaultCalView,
          widgets: widgetsToJson(next.widgets),
        },
        { onConflict: "user_id" },
      ),
    );
  },

  reorderWidgets(widgets: Settings["widgets"]) {
    actions.updateSettings({ widgets });
  },
};

/** Wipes every row for the signed-in user. Used by Profile's reset action. */
export async function deleteAllUserData() {
  const { userId, queryClient } = requireStoreContext();
  // projects cascade to subprojects/tasks/goals, habits cascade to habit_logs,
  // but tasks and goals can exist unlinked so they're deleted explicitly too.
  const tables = [
    "focus_sessions",
    "events",
    "habit_logs",
    "habits",
    "tasks",
    "goals",
    "subprojects",
    "projects",
    "user_settings",
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  await queryClient.invalidateQueries({ queryKey: qk.all(userId) });
}
