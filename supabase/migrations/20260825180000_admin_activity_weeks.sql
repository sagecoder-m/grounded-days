-- Recover the pilot's history from what people actually made.
--
-- usage_events only exists from the hq_admin migration onward, so every week a
-- tester lived through before instrumentation reads as a gap in the retention
-- grid. But the rows they created in those weeks are still here, each carrying a
-- timestamp: tasks, habits and their ticks, journal entries, goals, courses,
-- assistant messages, focus sessions, share links. That is evidence of someone
-- using the app, and it predates telemetry by as long as the account has existed.
--
-- Why a function instead of a query from the client: RLS on every one of those
-- tables is auth.uid() = user_id with no admin exception, which is correct and
-- should stay that way. A SECURITY DEFINER function is the narrow, auditable
-- alternative to poking an admin-read hole in ten separate policies.
--
-- What it returns is the whole privacy story: a user id and a week. No titles,
-- no bodies, no dates finer than a week, no counts. It cannot answer "what did
-- they write" or even "how much did they do" — only "was this person doing
-- something that week", which is the single question the retention grid asks.
-- Journal entries are counted the same way, by existence alone; the telemetry
-- vocabulary already records journal_entry_add, so this collects nothing new in
-- kind, and nothing anyone wrote is readable here or anywhere else.

CREATE FUNCTION public.admin_activity_weeks()
RETURNS TABLE (user_id uuid, week_start text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- The same gate the telemetry SELECT policies use, enforced server-side. A
  -- SECURITY DEFINER function bypasses RLS by design, so this check is the only
  -- thing standing between a tester and everyone else's activity.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  -- date_trunc('week', ...) is Monday-based in Postgres, matching the grid's
  -- weekStartsOn: 1. Returned as text so the client parses it as a local
  -- calendar date; handing over a date/timestamp invites the UTC-midnight
  -- rollback that shifts a week boundary by one day west of Greenwich.
  SELECT DISTINCT
    a.uid,
    to_char(date_trunc('week', a.at), 'YYYY-MM-DD')
  FROM (
    SELECT t.user_id AS uid, t.created_at AS at FROM public.tasks t
    -- Local events only. An imported calendar row is created by a sync job, not
    -- by a person, and counting it would credit activity to whoever happened to
    -- have a connected calendar.
    UNION ALL SELECT e.user_id, e.created_at FROM public.events e WHERE e.source = 'local'
    UNION ALL SELECT h.user_id, h.created_at FROM public.habits h
    UNION ALL SELECT hl.user_id, hl.created_at FROM public.habit_logs hl
    UNION ALL SELECT j.user_id, j.created_at FROM public.journal_entries j
    UNION ALL SELECT g.user_id, g.created_at FROM public.goals g
    UNION ALL SELECT c.user_id, c.created_at FROM public.courses c
    UNION ALL SELECT am.user_id, am.created_at FROM public.assistant_messages am
    -- focus_sessions records completed_at, not created_at: a session only exists
    -- once it has finished.
    UNION ALL SELECT fs.user_id, fs.completed_at FROM public.focus_sessions fs
    UNION ALL SELECT sl.user_id, sl.created_at FROM public.share_links sl
  ) AS a(uid, at)
  WHERE a.uid IS NOT NULL;
END;
$$;

-- Callable by signed-in accounts, but the body refuses anyone who is not an
-- admin. Explicitly not available to anon.
REVOKE ALL ON FUNCTION public.admin_activity_weeks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_activity_weeks() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_weeks() TO authenticated;

COMMENT ON FUNCTION public.admin_activity_weeks() IS
  'Admin-only. Distinct (user, week) pairs where the user created something, recovering pilot history from before usage_events existed. Returns no content and no counts.';
