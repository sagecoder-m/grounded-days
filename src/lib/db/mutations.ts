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
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  Area,
  CalendarConnection,
  CalendarProvider,
  CalEvent,
  Course,
  Goal,
  JournalEntry,
  Mood,
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
  type GoalStepWithParent,
  type HabitBase,
  type HabitLogEntry,
  type ProjectBase,
  type SubprojectWithParent,
} from "./mappers";
// Only ever called with a fixed event name — no titles or content pass through.
import { track } from "@/lib/telemetry";

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

/**
 * Where a newly created card lands: after everything already there.
 *
 * Read from the cache rather than the database — the write is fire-and-forget
 * and the cache is already authoritative for what the user can see. Falling
 * back to the list length keeps it sane on a cold cache.
 */
function nextPosition<T extends { position: number }>(rows: T[] | undefined): number {
  const list = rows ?? [];
  return list.reduce((max, r) => Math.max(max, r.position ?? 0), 0) + 1;
}

export const actions = {
  // ------------------------------------------------------------------- tasks

  addTask(input: Omit<Task, "id" | "done" | "createdAt">) {
    track("task_add");
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
        course_id: input.courseId ?? null,
      }),
    );
  },

  toggleTask(id: string) {
    track("task_toggle");
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
    track("habit_add");
    const { userId, queryClient } = requireStoreContext();
    const id = uuid();
    const position = nextPosition(
      queryClient.getQueryData(qk.habits(userId)) as HabitBase[] | undefined,
    );
    const optimistic: HabitBase = { id, name, position, createdAt: Date.now() };
    void write([{ key: qk.habits(userId), update: listAdd(optimistic) }], () =>
      supabase.from("habits").insert({ id, user_id: userId, name, position }),
    );
  },

  /**
   * Put back a deleted habit along with its completion history.
   *
   * Deleting a habit takes weeks of logged days with it, and the control that
   * does it sits one tap from the habit's name. An undo is a better answer than
   * a confirmation dialog: it keeps deleting as quick as it should be, and
   * matches an app whose whole premise is that nothing here is permanent.
   *
   * The habit comes back under a new id — the rows are gone, not archived — so
   * this is a faithful restore rather than a true reversal.
   */
  restoreHabit(name: string, dates: string[]) {
    const { userId, queryClient } = requireStoreContext();
    const id = uuid();
    const position = nextPosition(
      queryClient.getQueryData(qk.habits(userId)) as HabitBase[] | undefined,
    );
    const optimistic: HabitBase = { id, name, position, createdAt: Date.now() };
    void write(
      [
        { key: qk.habits(userId), update: listAdd(optimistic) },
        {
          key: qk.habitLogs(userId),
          update: (prev: HabitLogEntry[] | undefined) => [
            ...(prev ?? []),
            ...dates.map((date) => ({ habitId: id, date })),
          ],
        },
      ],
      async () => {
        const created = await supabase.from("habits").insert({ id, user_id: userId, name });
        if (created.error) return created;
        if (dates.length === 0) return created;
        return await supabase
          .from("habit_logs")
          .insert(dates.map((date) => ({ user_id: userId, habit_id: id, date })));
      },
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
    track("habit_toggle");
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

  // ----------------------------------------------------------------- courses

  addCourse(name: string, code?: string, term?: string) {
    track("course_add");
    const { userId, queryClient } = requireStoreContext();
    const id = uuid();
    const position = nextPosition(
      queryClient.getQueryData(qk.courses(userId)) as Course[] | undefined,
    );
    const optimistic: Course = { id, name, code, term, position, createdAt: Date.now() };
    void write([{ key: qk.courses(userId), update: listAdd(optimistic) }], () =>
      supabase
        .from("courses")
        .insert({ id, user_id: userId, name, code: code ?? null, term: term ?? null, position }),
    );
  },

  updateCourse(id: string, patch: Partial<Course>) {
    const { userId } = requireStoreContext();
    const row: TablesUpdate<"courses"> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.code !== undefined) row.code = patch.code ?? null;
    if (patch.term !== undefined) row.term = patch.term ?? null;
    if (patch.position !== undefined) row.position = patch.position;
    void write([{ key: qk.courses(userId), update: listPatch<Course>(id, patch) }], () =>
      supabase.from("courses").update(row).eq("id", id),
    );
  },

  /**
   * Removing a course leaves its assignments alone.
   *
   * The foreign key is ON DELETE SET NULL, so they become loose education tasks
   * rather than disappearing — dropping a finished course must not delete a
   * term's worth of completed work. The tasks cache is invalidated because their
   * course_id changed in the database with nothing to patch locally.
   */
  deleteCourse(id: string) {
    const { userId } = requireStoreContext();
    void write(
      [{ key: qk.courses(userId), update: listRemove<Course>(id) }],
      () => supabase.from("courses").delete().eq("id", id),
      { alsoInvalidate: [qk.tasks(userId)] },
    );
  },

  // ---------------------------------------------------------------- ordering

  /**
   * Persist a dragged order for one collection.
   *
   * Writes every row's new position in a single request rather than one update
   * per card: a five-card reorder should not be five round trips, and a partial
   * failure would leave the list in an order nobody chose.
   */
  reorderCards(
    collection: "goals" | "projects" | "habits" | "courses",
    orderedIds: string[],
  ) {
    const { userId, queryClient } = requireStoreContext();
    const key =
      collection === "goals"
        ? qk.goals(userId)
        : collection === "projects"
          ? qk.projects(userId)
          : collection === "habits"
            ? qk.habits(userId)
            : qk.courses(userId);

    const positionById = new Map(orderedIds.map((id, index) => [id, index + 1]));

    void write(
      [
        {
          key,
          update: (prev: { id: string; position: number }[] | undefined) =>
            [...(prev ?? [])]
              .map((row) => ({ ...row, position: positionById.get(row.id) ?? row.position }))
              .sort((a, b) => a.position - b.position),
        },
      ],
      async () => {
        for (const [id, position] of positionById) {
          const { error } = await supabase.from(collection).update({ position }).eq("id", id);
          if (error) return { error };
        }
        return { error: null };
      },
    );
    // Keep the cache read consistent for anything reading a different key.
    void queryClient.invalidateQueries({ queryKey: key });
  },

  // ------------------------------------------------------------------- goals

  addGoal(input: Omit<Goal, "id" | "progress" | "steps" | "position"> & { progress?: number }) {
    track("goal_add");
    const { userId, queryClient } = requireStoreContext();
    const id = uuid();
    const progress = input.progress ?? 0;
    const position = nextPosition(
      queryClient.getQueryData(qk.goals(userId)) as Goal[] | undefined,
    );
    const optimistic: Goal = { ...input, id, progress, position, steps: [] };
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
        position,
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

  addProject(name: string, description?: string, area: Area = "professional") {
    const { userId, queryClient } = requireStoreContext();
    const id = uuid();
    const position = nextPosition(
      queryClient.getQueryData(qk.projects(userId)) as ProjectBase[] | undefined,
    );
    const optimistic: ProjectBase = { id, name, description, status: "active", area, position };
    void write([{ key: qk.projects(userId), update: listAdd(optimistic) }], () =>
      supabase.from("projects").insert({
        id,
        user_id: userId,
        name,
        description: description ?? null,
        status: "active",
        area,
        position,
      }),
    );
  },

  // ------------------------------------------------------------- goal steps

  /**
   * Steps are what a goal's percentage is computed from, so every write here
   * invalidates goals too — the number on screen is derived, not stored.
   */
  addGoalStep(goalId: string, title: string, position: number) {
    const { userId } = requireStoreContext();
    const id = uuid();
    void write(
      [
        {
          key: qk.goalSteps(userId),
          update: listAdd({ id, goalId, title, done: false }),
        },
      ],
      () =>
        supabase.from("goal_steps").insert({
          id,
          user_id: userId,
          goal_id: goalId,
          title,
          done: false,
          position,
        }),
    );
  },

  toggleGoalStep(id: string, done: boolean) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.goalSteps(userId),
          update: listPatch<GoalStepWithParent>(id, { done }),
        },
      ],
      () => supabase.from("goal_steps").update({ done }).eq("id", id),
    );
  },

  renameGoalStep(id: string, title: string) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.goalSteps(userId),
          update: listPatch<GoalStepWithParent>(id, { title }),
        },
      ],
      () => supabase.from("goal_steps").update({ title }).eq("id", id),
    );
  },

  deleteGoalStep(id: string) {
    const { userId } = requireStoreContext();
    void write(
      [
        {
          key: qk.goalSteps(userId),
          update: listRemove<GoalStepWithParent>(id),
        },
      ],
      () => supabase.from("goal_steps").delete().eq("id", id),
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
    track("event_add");
    const { userId } = requireStoreContext();
    const id = uuid();
    const optimistic: CalEvent = { ...input, id, source: "local", allDay: true };
    void write([{ key: qk.events(userId), update: listAdd(optimistic) }], () =>
      supabase.from("events").insert({
        id,
        user_id: userId,
        title: input.title,
        date: input.date,
        end_date: input.endDate ?? null,
        area: input.area ?? null,
        source: "local",
        all_day: true,
      }),
    );
  },

  updateEvent(id: string, patch: Partial<CalEvent>) {
    track("event_move");
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

  // ----------------------------------------------------------------- journal

  /**
   * Write today's entry, creating it if this is the first edit of the day.
   *
   * An upsert on (user_id, date) rather than create-then-update: the editor
   * saves on a debounce as you type, and a first keystroke racing its own
   * follow-up would otherwise produce two rows for one day.
   */
  saveJournalEntry(date: string, patch: { body?: string; mood?: Mood | null; gratitude?: string }) {
    track("journal_entry_add");
    const { userId, queryClient } = requireStoreContext();
    const existing = (
      (queryClient.getQueryData(qk.journal(userId)) as JournalEntry[] | undefined) ?? []
    ).find((e) => e.date === date);
    const id = existing?.id ?? uuid();

    const merged: JournalEntry = {
      id,
      date,
      body: patch.body ?? existing?.body ?? "",
      mood: patch.mood === null ? undefined : (patch.mood ?? existing?.mood),
      gratitude: patch.gratitude ?? existing?.gratitude,
    };

    void write(
      [
        {
          key: qk.journal(userId),
          update: (prev: JournalEntry[] | undefined) => {
            const rest = (prev ?? []).filter((e) => e.date !== date);
            return [merged, ...rest].sort((a, b) => b.date.localeCompare(a.date));
          },
        },
      ],
      () =>
        supabase.from("journal_entries").upsert(
          {
            id,
            user_id: userId,
            date,
            body: merged.body,
            mood: merged.mood ?? null,
            gratitude: merged.gratitude ?? null,
          },
          { onConflict: "user_id,date" },
        ),
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

  /**
   * Subscribe to an .ics feed.
   *
   * No edge function needed to create it: unlike the OAuth providers there is no
   * secret to exchange, so the row is written directly under RLS. account_id
   * holds the feed URL, which makes the existing (user_id, provider, account_id)
   * unique index reject the same feed twice without a duplicate check here.
   *
   * The sync runs immediately and rethrows, so a wrong address fails in front of
   * the person who typed it instead of leaving a connection that quietly returns
   * nothing. If it fails the connection is removed again rather than left behind
   * in an error state nobody asked for.
   */
  async addCalendarFeed(feedUrl: string) {
    const { userId, queryClient } = requireStoreContext();
    const { data, error } = await supabase
      .from("calendar_connections")
      .insert({
        user_id: userId,
        provider: "ical",
        account_id: feedUrl,
        feed_url: feedUrl,
        status: "connected",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "You are already subscribed to that feed."
          : error.message,
      );
    }

    try {
      const { error: syncError } = await supabase.functions.invoke("calendar-sync", { body: {} });
      if (syncError) throw new Error(syncError.message);
    } catch (err) {
      await supabase.from("calendar_connections").delete().eq("id", data.id);
      throw err;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.events(userId) }),
      queryClient.invalidateQueries({ queryKey: qk.calendarConnections(userId) }),
    ]);
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
    track("focus_session");
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
        // Mapped from the whole settings object rather than listed by hand.
        // The hand-written version had drifted: it omitted nav_layout, so
        // choosing a navigation layout updated the cache, wrote a row without
        // it, and silently reverted on the next refetch. Going through the
        // mapper means a newly added setting cannot be forgotten here.
        { user_id: userId, ...settingsPatchToRow(next) },
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
