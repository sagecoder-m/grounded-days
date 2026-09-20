-- The dedupe ledger and the schedule for send-notifications, following the
-- exact pattern 20260905010000_scheduled_calendar_sync.sql already
-- established for calendar-sync: pg_cron + pg_net + the service key in
-- Vault + a locked-down `ops` schema. That migration created the schema and
-- both extensions; this one only adds to them.

-- ------------------------------------------------------------- dedupe ledger

/*
 * One row per notification actually sent, and the thing that makes "exactly
 * once" true under a cron job that ticks every 15 minutes.
 *
 * The unique constraint is the real gate, not a courtesy check beforehand: the
 * sender always attempts `INSERT ... ON CONFLICT DO NOTHING` first and only
 * sends if that insert reports a new row. A plain "check, then send, then
 * record" would leave a window between the check and the record where two
 * overlapping ticks — a slow run that has not finished when the next one
 * starts — could both decide the same notification had not gone out yet.
 * Making Postgres itself the arbiter, via the constraint, removes the window
 * entirely rather than narrowing it.
 *
 * `ref_id` is the row a notification is about: a task's own id for
 * `task_due`, and the fixed string 'daily' for `morning`, which concerns the
 * day rather than any one row. `for_date` is the day it concerns *in the
 * account's own timezone* — the point of storing one at all.
 */
CREATE TABLE IF NOT EXISTS public.notifications_sent (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('task_due', 'morning')),
  ref_id text NOT NULL,
  for_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref_id, for_date)
);

CREATE INDEX IF NOT EXISTS notifications_sent_user_id_idx
  ON public.notifications_sent (user_id);

-- No policies at all, matching calendar_credentials and
-- calendar_oauth_states: this is the sender's own bookkeeping. A client has
-- no legitimate reason to read or write it, so RLS with nothing granted
-- denies both by default rather than needing a policy that says so.
ALTER TABLE public.notifications_sent ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------- the schedule

/*
  Calls send-notifications as the service role, every 15 minutes.

  Same reasoning as run_calendar_sync for reading the key from Vault rather
  than writing it here, and the same quiet "raise notice" rather than an
  error when Vault has nothing yet — a fresh clone or a local stack should
  not have a cron job failing loudly every 15 minutes over secrets nobody
  has set up.

  15 minutes, not hourly like the calendar sync: a task due in a few hours
  needs a firing window a person can actually still act inside, and a
  morning line sent up to an hour late defeats the point of choosing a time
  for it.
*/
CREATE OR REPLACE FUNCTION ops.run_send_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  service_key text;
  project_url text;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';

  IF service_key IS NULL OR project_url IS NULL THEN
    RAISE NOTICE 'send-notifications skipped: vault is missing service_role_key or project_url';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE ALL ON FUNCTION ops.run_send_notifications() FROM public;
REVOKE ALL ON FUNCTION ops.run_send_notifications() FROM anon, authenticated;

SELECT cron.unschedule('send-notifications-every-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-notifications-every-15min');

SELECT cron.schedule(
  'send-notifications-every-15min',
  '*/15 * * * *',
  $$SELECT ops.run_send_notifications()$$
);
