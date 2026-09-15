-- The clinician point of view: a demo-only preview, not the clinical layer.
--
-- The clinical-layer spec (access tiers, consent, a real clinician dashboard
-- reading someone else's real data) is deliberately not built here — see the
-- "Build Scope Decision" brief: it recommends deferring that surface until a
-- provider has actually asked for it, both because building it first risks
-- the wrong dashboard and because it puts client health data behind a surface
-- during a pilot before the business-associate question is settled.
--
-- What this migration adds is narrower and lower-stakes: one account (the
-- demo account) can preview what a clinician-shaped view of *its own* data
-- would look like, and one account (HQ) can review that preview from the
-- admin console. Neither reads anyone else's real data — the demo account
-- only ever sees its own tasks/goals/habits, exactly as RLS already allows any
-- account to see its own rows; the only new cross-account read is HQ looking
-- at the one demo account, and that path is hardcoded to that one account
-- rather than accepting an arbitrary target, on purpose.

-- ------------------------------------------------------------- demo account

-- Same shape as admin_emails/admin_users, for the same reason: an email seed
-- table no client role can read, and a uid table with a "check your own row"
-- policy that a signup trigger keeps in sync — so promoting the demo account
-- does not depend on it having signed up before this migration runs.
CREATE TABLE public.demo_emails (
  email text NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_emails ENABLE ROW LEVEL SECURITY;
-- No policies at all: invisible to every client role, service role only.

INSERT INTO public.demo_emails (email) VALUES ('demo@groundeddays.app');

CREATE TABLE public.demo_users (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_users ENABLE ROW LEVEL SECURITY;

-- A user may ask only "am I the demo account". Everyone else sees zero rows —
-- this is what the UI toggle and nav item are gated on client-side, in the
-- same spirit useIsAdmin() already documents: this check decides what to
-- render, not what can be read. The demo account reading its own tasks/goals
-- is already governed by the ordinary per-user RLS on those tables; nothing
-- about being "the demo account" grants it anything extra.
CREATE POLICY "Users can check their own demo status" ON public.demo_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.demo_users (user_id)
SELECT u.id FROM auth.users u
JOIN public.demo_emails d ON lower(u.email) = lower(d.email)
ON CONFLICT (user_id) DO NOTHING;

CREATE FUNCTION public.promote_demo_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.demo_emails WHERE lower(email) = lower(NEW.email)) THEN
    INSERT INTO public.demo_users (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER promote_demo_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.promote_demo_on_signup();

-- ------------------------------------------------- HQ's read of demo's data

/**
 * What the demo account's clinician preview shows, for HQ to review.
 *
 * Same computation as the share-view edge function's summary material —
 * completions and open work as area+date pairs, never titles, over the same
 * 56-day window — just read directly against Postgres instead of over HTTP,
 * because this runs inside the admin console rather than behind a public
 * token. Returned as one jsonb object shaped to match SharedView on the
 * client, so the admin console and the demo account's own page can render it
 * with the exact same component.
 *
 * Hardcoded to the one demo account rather than taking a target user id. The
 * ask was specifically "no one should have this view except the demo
 * account" — a parameterised version of this function would make every other
 * account's data one RPC call away from any admin session, which is a much
 * bigger permission than was asked for.
 */
CREATE FUNCTION public.admin_clinician_preview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_uid uuid;
  since_date date := (now() - interval '56 days')::date;
  result jsonb;
BEGIN
  -- The same gate admin_activity_weeks uses. A SECURITY DEFINER function
  -- bypasses RLS by design, so this check is the only thing standing between
  -- a tester and the demo account's data.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT user_id INTO demo_uid FROM public.demo_users LIMIT 1;
  IF demo_uid IS NULL THEN
    RAISE EXCEPTION 'no demo account is registered yet';
  END IF;

  SELECT jsonb_build_object(
    'since', to_char(since_date, 'YYYY-MM-DD'),
    'areas', jsonb_build_array('personal', 'professional', 'education'),
    'goals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'area', g.area, 'progress', g.progress))
       FROM public.goals g WHERE g.user_id = demo_uid),
      '[]'::jsonb
    ),
    'habits', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name))
       FROM public.habits h WHERE h.user_id = demo_uid),
      '[]'::jsonb
    ),
    -- Finished work in the window, as area + the day it was finished. No
    -- titles — an area and a date describe the shape of two months without
    -- saying what was in it.
    'completions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('area', t.area, 'date', to_char(t.updated_at, 'YYYY-MM-DD')))
       FROM public.tasks t
       WHERE t.user_id = demo_uid AND t.done AND t.updated_at >= since_date),
      '[]'::jsonb
    ),
    -- Still open, any date — including undated, which jsonb_build_object
    -- renders as JSON null and the client already treats as "no date".
    'openWork', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('area', t.area, 'date', t.date))
       FROM public.tasks t WHERE t.user_id = demo_uid AND NOT t.done),
      '[]'::jsonb
    ),
    'habitCheckins', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', l.date))
       FROM public.habit_logs l WHERE l.user_id = demo_uid AND l.date >= since_date),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;
