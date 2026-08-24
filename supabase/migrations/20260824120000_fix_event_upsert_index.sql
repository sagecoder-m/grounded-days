-- Make the calendar sync upsert actually work.
--
-- The index was created partial:
--
--   CREATE UNIQUE INDEX events_connection_external_idx
--     ON public.events (connection_id, external_id)
--     WHERE connection_id IS NOT NULL;
--
-- Postgres will only use a partial index for ON CONFLICT if the statement
-- restates the same predicate, and PostgREST's onConflict parameter passes
-- column names only. So every sync failed with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- A plain unique index is equally safe here. Postgres treats NULLs as distinct
-- in a unique index by default, so local events — which have NULL
-- connection_id and NULL external_id — remain unconstrained and can still
-- number in the thousands. The predicate was never buying anything.

DROP INDEX IF EXISTS public.events_connection_external_idx;

CREATE UNIQUE INDEX events_connection_external_idx
  ON public.events (connection_id, external_id);

-- Clear the failed state so the next sync is judged on its own merits rather
-- than showing an error from a bug that no longer exists.
UPDATE public.calendar_connections
SET status = 'connected', status_detail = NULL
WHERE status = 'error'
  AND status_detail LIKE '%ON CONFLICT specification%';

-- Sweep abandoned handshakes. calendar-oauth-start prunes these opportunistically
-- on each new attempt, but a row left from a redirect that never returned is
-- just litter.
DELETE FROM public.calendar_oauth_states
WHERE created_at < now() - interval '30 minutes';
