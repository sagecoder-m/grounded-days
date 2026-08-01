/**
 * One queryOptions per collection.
 *
 * These read straight from the browser Supabase client. RLS already scopes every
 * table by auth.uid(), so a server function would add a hop without adding
 * safety — and with no router/query SSR integration installed it would render
 * as pending during SSR anyway.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "./keys";
import {
  rowToEvent,
  rowToFocusSession,
  rowToGoal,
  rowToHabit,
  rowToHabitLog,
  rowToProject,
  rowToSettings,
  rowToSubproject,
  rowToTask,
} from "./mappers";

/** Postgrest errors carry a message; surface it so mutations can toast it. */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

export function tasksQuery(userId: string) {
  return queryOptions({
    queryKey: qk.tasks(userId),
    queryFn: async () => {
      const res = await supabase.from("tasks").select("*").order("created_at", { ascending: true });
      return unwrap(res).map(rowToTask);
    },
  });
}

export function habitsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.habits(userId),
    queryFn: async () => {
      const res = await supabase
        .from("habits")
        .select("*")
        .order("created_at", { ascending: true });
      return unwrap(res).map(rowToHabit);
    },
  });
}

export function habitLogsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.habitLogs(userId),
    queryFn: async () => {
      const res = await supabase.from("habit_logs").select("*");
      return unwrap(res).map(rowToHabitLog);
    },
  });
}

export function goalsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.goals(userId),
    queryFn: async () => {
      const res = await supabase.from("goals").select("*").order("created_at", { ascending: true });
      return unwrap(res).map(rowToGoal);
    },
  });
}

export function projectsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.projects(userId),
    queryFn: async () => {
      const res = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: true });
      return unwrap(res).map(rowToProject);
    },
  });
}

export function subprojectsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.subprojects(userId),
    queryFn: async () => {
      const res = await supabase
        .from("subprojects")
        .select("*")
        .order("created_at", { ascending: true });
      return unwrap(res).map(rowToSubproject);
    },
  });
}

export function eventsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.events(userId),
    queryFn: async () => {
      const res = await supabase.from("events").select("*").order("date", { ascending: true });
      return unwrap(res).map(rowToEvent);
    },
  });
}

export function focusSessionsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.focusSessions(userId),
    queryFn: async () => {
      const res = await supabase
        .from("focus_sessions")
        .select("*")
        .order("completed_at", { ascending: false });
      return unwrap(res).map(rowToFocusSession);
    },
  });
}

/**
 * Settings is one row per user, created lazily on first write. A brand-new
 * account has no row, so maybeSingle() + defaults is the expected path rather
 * than an error case.
 */
export function settingsQuery(userId: string) {
  return queryOptions({
    queryKey: qk.settings(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return rowToSettings(data);
    },
  });
}
