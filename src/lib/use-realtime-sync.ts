import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { qk } from "./db/keys";
import { useStoreContext } from "./db/context";

/**
 * Table -> the query key it feeds, mirroring db/queries.ts one-for-one.
 *
 * calendar_connections and hasPasscode are deliberately not here: the first
 * changes through its own OAuth round trip (not a plain write another device
 * would make), and the second has no query key at all.
 */
const SYNCED_TABLES: { table: string; key: (userId: string) => readonly unknown[] }[] = [
  { table: "tasks", key: qk.tasks },
  { table: "habits", key: qk.habits },
  { table: "habit_logs", key: qk.habitLogs },
  { table: "goals", key: qk.goals },
  { table: "goal_steps", key: qk.goalSteps },
  { table: "projects", key: qk.projects },
  { table: "subprojects", key: qk.subprojects },
  { table: "courses", key: qk.courses },
  { table: "events", key: qk.events },
  { table: "journal", key: qk.journal },
  { table: "focus_sessions", key: qk.focusSessions },
  { table: "user_settings", key: qk.settings },
];

/**
 * Keeps every device signed into the same account in sync without a manual
 * refresh — the app's own answer to "I finished this on my phone, why does
 * my laptop still show it open."
 *
 * Postgres is already the one source of truth: every write in mutations.ts
 * goes through it, and every read in queries.ts comes from it. So this hook
 * does not try to reconstruct app state from a realtime payload itself —
 * that would mean two separate code paths turning a database row into a
 * Task, which drift apart the moment one of them gets a mapper fixed and the
 * other does not. It only invalidates the matching React Query key on any
 * change, exactly what a local write already does after it succeeds (see
 * `write()` in mutations.ts), and lets the existing query machinery refetch.
 * A later write on any device always wins, because every device is reading
 * the same table.
 */
export function useRealtimeSync() {
  const ctx = useStoreContext();
  const userId = ctx?.userId;
  const queryClient = ctx?.queryClient;

  useEffect(() => {
    if (!userId || !queryClient) return;

    const channel = supabase.channel(`sync:${userId}`);
    for (const { table, key } of SYNCED_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: key(userId) });
        },
      );
    }
    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
