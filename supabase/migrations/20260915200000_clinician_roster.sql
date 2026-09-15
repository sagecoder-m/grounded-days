-- A clinician's roster, and the two working surfaces attached to it: a
-- treatment plan per patient and a log of dated notes. Both clinician-only —
-- the patient/tester never reads either, matching the scope decided for this
-- prototype. See clinician_accounts.sql for the account type itself.

-- ---------------------------------------------------------------- roster

-- Who a clinician account may see. Assignment is admin-managed, not
-- self-service: there is no consent flow yet (that is exactly the §1/§3
-- scope the Build Scope Decision brief defers), so a row here is HQ's own
-- decision to make, not a testers's or a clinician's.
CREATE TABLE public.clinician_patients (
  clinician_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinician_user_id, patient_user_id)
);

ALTER TABLE public.clinician_patients ENABLE ROW LEVEL SECURITY;

-- A clinician may read their own roster rows. No write policy for any client
-- role: assignment happens through admin-accounts, under the service role,
-- which bypasses RLS — the same reason clinician_users itself has no insert
-- policy.
CREATE POLICY "Clinicians can see their own roster" ON public.clinician_patients
  FOR SELECT TO authenticated USING (auth.uid() = clinician_user_id);

-- ------------------------------------------------------- per-patient preview

-- Replaces clinician_data_preview(), which always resolved to the one demo
-- account. This resolves to whichever patient is named, and is authorized
-- against the roster instead of a hardcoded target — an admin may preview
-- any account (matching its existing reach), a clinician only an account
-- actually on their own roster.
DROP FUNCTION IF EXISTS public.clinician_data_preview();

CREATE FUNCTION public.clinician_patient_preview(patient_email text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_uid uuid;
  since_date date := (now() - interval '56 days')::date;
  result jsonb;
BEGIN
  SELECT id INTO target_uid FROM auth.users WHERE lower(email) = lower(patient_email);
  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'no account for that email';
  END IF;

  IF NOT (
    public.is_admin()
    OR (
      public.is_clinician_account()
      AND EXISTS (
        SELECT 1 FROM public.clinician_patients cp
        WHERE cp.clinician_user_id = auth.uid() AND cp.patient_user_id = target_uid
      )
    )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'since', to_char(since_date, 'YYYY-MM-DD'),
    'areas', jsonb_build_array('personal', 'professional', 'education'),
    'goals', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'area', g.area, 'progress', g.progress))
       FROM public.goals g WHERE g.user_id = target_uid),
      '[]'::jsonb
    ),
    'habits', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name))
       FROM public.habits h WHERE h.user_id = target_uid),
      '[]'::jsonb
    ),
    'completions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('area', t.area, 'date', to_char(t.updated_at, 'YYYY-MM-DD')))
       FROM public.tasks t
       WHERE t.user_id = target_uid AND t.done AND t.updated_at >= since_date),
      '[]'::jsonb
    ),
    'openWork', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('area', t.area, 'date', t.date))
       FROM public.tasks t WHERE t.user_id = target_uid AND NOT t.done),
      '[]'::jsonb
    ),
    'habitCheckins', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', l.date))
       FROM public.habit_logs l WHERE l.user_id = target_uid AND l.date >= since_date),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

/**
 * A clinician's own roster, as email + display name — what the roster page
 * lists before you click into any one patient's dashboard.
 *
 * SECURITY DEFINER because a clinician cannot otherwise read auth.users or
 * another account's user_settings row at all; this hands back exactly two
 * fields, nothing else about the account.
 */
CREATE FUNCTION public.clinician_my_patients() RETURNS TABLE (
  patient_email text,
  display_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_clinician_account() THEN
    RAISE EXCEPTION 'clinician accounts only';
  END IF;

  RETURN QUERY
  SELECT u.email::text, s.display_name
  FROM public.clinician_patients cp
  JOIN auth.users u ON u.id = cp.patient_user_id
  LEFT JOIN public.user_settings s ON s.user_id = cp.patient_user_id
  WHERE cp.clinician_user_id = auth.uid()
  ORDER BY u.email;
END;
$$;

-- ------------------------------------------------------------- plans + notes

-- One editable document per (clinician, patient) pair — "the plan", upserted
-- rather than versioned. A prototype's working space, not a clinical record;
-- versioning and audit trail are exactly the kind of thing to add once a
-- provider has actually used this and said what they need from it.
CREATE TABLE public.clinician_patient_plans (
  clinician_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinician_user_id, patient_user_id)
);

ALTER TABLE public.clinician_patient_plans ENABLE ROW LEVEL SECURITY;

-- Admin can read for oversight, matching every other clinician-facing surface
-- in this prototype; only the owning clinician can write. The patient is
-- never a party to this policy at all — not "denied", simply never named,
-- which is what "clinician-only" means enforced rather than promised.
CREATE POLICY "Clinicians and admin can read plans" ON public.clinician_patient_plans
  FOR SELECT TO authenticated USING (auth.uid() = clinician_user_id OR public.is_admin());

-- WITH CHECK also requires the patient to actually be on this clinician's
-- roster — auth.uid() = clinician_user_id alone would let a session write a
-- plan against any tester's uuid, assigned or not, which is a bigger
-- authorization gap than "clinician-only" was meant to leave open.
CREATE POLICY "Clinicians can write plans for their own patients" ON public.clinician_patient_plans
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = clinician_user_id
    AND EXISTS (
      SELECT 1 FROM public.clinician_patients cp
      WHERE cp.clinician_user_id = auth.uid() AND cp.patient_user_id = clinician_patient_plans.patient_user_id
    )
  );

CREATE POLICY "Clinicians can update plans for their own patients" ON public.clinician_patient_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = clinician_user_id)
  WITH CHECK (
    auth.uid() = clinician_user_id
    AND EXISTS (
      SELECT 1 FROM public.clinician_patients cp
      WHERE cp.clinician_user_id = auth.uid() AND cp.patient_user_id = clinician_patient_plans.patient_user_id
    )
  );

-- A dated log, append-style — what the original ask called a "chatbox",
-- scoped down to notes the clinician writes to themselves rather than
-- messages delivered to a real tester. See the decision this turn: real
-- two-way messaging to pilot testers is a bigger, separate call.
CREATE TABLE public.clinician_patient_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinician_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinician_patient_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinicians and admin can read notes" ON public.clinician_patient_notes
  FOR SELECT TO authenticated USING (auth.uid() = clinician_user_id OR public.is_admin());

-- Same roster check as the plans policy above, and for the same reason.
CREATE POLICY "Clinicians can write notes for their own patients" ON public.clinician_patient_notes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = clinician_user_id
    AND EXISTS (
      SELECT 1 FROM public.clinician_patients cp
      WHERE cp.clinician_user_id = auth.uid() AND cp.patient_user_id = clinician_patient_notes.patient_user_id
    )
  );

CREATE POLICY "Clinicians can delete their own notes" ON public.clinician_patient_notes
  FOR DELETE TO authenticated USING (auth.uid() = clinician_user_id);
