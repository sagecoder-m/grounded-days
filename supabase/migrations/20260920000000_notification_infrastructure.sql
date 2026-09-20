-- The two things a scheduled notification needs that nothing in this database
-- has ever recorded: what local time it is for a given account, and where to
-- deliver to.
--
-- Due times are stored timezone-naive on purpose (see
-- 20260831230000_assignment_due_time.sql) — "11:59pm" is 11:59pm where the
-- student is, not an instant on a global clock. That was the right call for a
-- date a person types in. It leaves a real gap for anything server-side: a
-- cron job has no timezone of its own to fall back on, and without one stored
-- somewhere it cannot tell whether "11:59pm local" has actually arrived yet.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.user_settings.timezone IS
  'IANA zone name (e.g. "America/New_York"), captured client-side from '
  'Intl.DateTimeFormat().resolvedOptions().timeZone. Falls back to UTC rather '
  'than guessing, which is the honest answer for a device that has not '
  'reported one yet — never wrong, only ever less precise.';

-- Every notification type ships off by default, per
-- docs/PUSH_NOTIFICATIONS_PLAN.md and the policy it quotes from
-- docs/barktank/01-introduction.md: "notify about the calendar, never about
-- the person," and every type the person did not deliberately turn on stays
-- silent.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notify_timer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_task_due boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_morning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_morning_at text NOT NULL DEFAULT '08:00';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_notify_morning_at_format;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_notify_morning_at_format
  -- Same 24-hour HH:MM shape as tasks.due_time, for the same reason: it round-
  -- trips exactly through PostgREST, where the `time` type does not.
  CHECK (notify_morning_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

COMMENT ON COLUMN public.user_settings.notify_morning_at IS
  '24-hour HH:MM, in this account''s own timezone column above — the moment '
  'the morning one-thing line is sent, when notify_morning is on.';

-- --------------------------------------------------------- push_subscriptions

/*
 * One row per browser subscription, not per account — the same person can
 * have a phone and a laptop both wanting notifications, and each is a
 * separate endpoint the push service addresses independently. `endpoint` is
 * the thing that makes a subscription unique: it is itself a full URL minted
 * by the browser's push service, so no two real subscriptions ever collide on
 * it, and re-subscribing the same device predictably lands on the same row
 * via upsert rather than piling up duplicates.
 */
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Bumped by the sender on a failed delivery, not by anything client-side.
  -- A subscription the push service has started rejecting is the browser
  -- telling the sender it is dead; the client itself has no way to observe
  -- that its own subscription has gone stale.
  failure_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push subscriptions"
  ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own push subscriptions"
  ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own push subscriptions"
  ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own push subscriptions"
  ON public.push_subscriptions;

-- Unlike calendar_connections, the client itself creates this row — the
-- browser is the only thing that ever holds a PushSubscription object, so
-- there is no server-side callback that could insert it instead. All four
-- operations are therefore the account's own to make, each scoped to it.
CREATE POLICY "Users can view their own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
