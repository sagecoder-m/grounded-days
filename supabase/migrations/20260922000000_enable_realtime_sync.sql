-- Turns on Postgres Realtime for the tables a signed-in account's own devices
-- need to stay in sync on: a task finished on a phone should show finished on
-- a laptop without a manual refresh.
--
-- REPLICA IDENTITY FULL comes before the publication add, and matters
-- specifically for DELETE: Realtime's per-row `filter` (user_id=eq.<uuid>,
-- set client-side in use-realtime-sync.ts) is evaluated against the OLD row
-- for a delete, and the default replica identity only carries the primary
-- key — not user_id — into that old row. Without FULL, a delete would simply
-- fail to match the filter and never reach the client at all.
--
-- RLS already restricts these tables to their owner (see
-- 20260731090000_normalize_relational_schema.sql), and Realtime enforces
-- that same RLS on top of the client-side filter, so this does not loosen
-- anything — it only makes DELETE visible on the channel the way INSERT and
-- UPDATE already would be.
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.habits REPLICA IDENTITY FULL;
ALTER TABLE public.habit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.goals REPLICA IDENTITY FULL;
ALTER TABLE public.goal_steps REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.subprojects REPLICA IDENTITY FULL;
ALTER TABLE public.courses REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.journal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.focus_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.user_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE
    public.tasks,
    public.habits,
    public.habit_logs,
    public.goals,
    public.goal_steps,
    public.projects,
    public.subprojects,
    public.courses,
    public.events,
    public.journal_entries,
    public.focus_sessions,
    public.user_settings;
EXCEPTION
  -- A table already added (by hand, in the dashboard, or by an earlier run
  -- of this migration) raises duplicate_object rather than being a no-op —
  -- this migration is meant to be safe to re-run, not just safe to run once.
  WHEN duplicate_object THEN NULL;
END $$;
