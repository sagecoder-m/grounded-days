-- Real clinician accounts, still a prototype in what they show.
--
-- The Clinician POV was, until now, a toggle available only to two special
-- accounts (demo, HQ). The actual ask was a real account a clinician can be
-- handed credentials for and sign into — full functioning login, prototype
-- dashboard. This migration adds the account type; nothing about what the
-- dashboard shows changes, and it still previews only the demo account's
-- data, for the same reason stated in the last migration: no real
-- client-clinician linking exists yet, and building that is exactly what the
-- "Build Scope Decision" brief recommends deferring until a provider asks.

-- ------------------------------------------------------------- the account

-- No emails-table-plus-signup-trigger pair this time, unlike admin/demo.
-- Those exist to promote an account that signs up *on its own* later, after
-- the email was already known. A clinician account is created by HQ, through
-- the admin-accounts function, in one service-role action — the row can be
-- written in that same action, so there is nothing for a trigger to catch
-- later.
CREATE TABLE public.clinician_users (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinician_users ENABLE ROW LEVEL SECURITY;

-- Same shape as demo_users: a user may ask only "am I a clinician account".
-- No insert/update/delete policy — only the service role writes this table,
-- from inside admin-accounts' "create" action.
CREATE POLICY "Users can check their own clinician status" ON public.clinician_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ------------------------------------------------- helpers for the RPC gate

-- Mirrors is_admin() exactly. Needed now because the preview RPC's gate has
-- to check "is this the demo account" and "is this a clinician account" from
-- SQL, not just from the client — the client-side checks
-- (useIsDemoAccount/useIsClinicianAccount) decide what renders, this is what
-- actually authorizes the read.
CREATE FUNCTION public.is_demo_account() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.demo_users WHERE user_id = auth.uid());
$$;

CREATE FUNCTION public.is_clinician_account() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinician_users WHERE user_id = auth.uid());
$$;

-- ------------------------------------------------------- the preview, again

-- Same body as admin_clinician_preview(), renamed because it is no longer
-- admin-only, and with the gate widened to the three account kinds allowed to
-- see it. What it returns does not change: the one demo account's data,
-- resolved server-side, never a caller-supplied target.
DROP FUNCTION IF EXISTS public.admin_clinician_preview();

CREATE FUNCTION public.clinician_data_preview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_uid uuid;
  since_date date := (now() - interval '56 days')::date;
  result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_demo_account() OR public.is_clinician_account()) THEN
    RAISE EXCEPTION 'not authorized';
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
    'completions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('area', t.area, 'date', to_char(t.updated_at, 'YYYY-MM-DD')))
       FROM public.tasks t
       WHERE t.user_id = demo_uid AND t.done AND t.updated_at >= since_date),
      '[]'::jsonb
    ),
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
