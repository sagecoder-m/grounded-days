-- clinician_patient_plans and clinician_patient_notes are keyed by
-- patient_user_id, and the client has no other way to learn it — a clinician
-- cannot read auth.users, so email is all clinician_my_patients() gave it.
-- Adding the id is not a new exposure: RLS on every table that id could be
-- used against (tasks, goals, habits, plans, notes) still fully governs what
-- a request against it can actually return: only an assigned patient's rows,
-- to their own clinician. The id on its own reveals nothing.
-- CREATE OR REPLACE cannot change a function's OUT-parameter signature; the
-- old two-column version has to go first.
DROP FUNCTION IF EXISTS public.clinician_my_patients();

CREATE FUNCTION public.clinician_my_patients() RETURNS TABLE (
  patient_user_id uuid,
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
  SELECT cp.patient_user_id, u.email::text, s.display_name
  FROM public.clinician_patients cp
  JOIN auth.users u ON u.id = cp.patient_user_id
  LEFT JOIN public.user_settings s ON s.user_id = cp.patient_user_id
  WHERE cp.clinician_user_id = auth.uid()
  ORDER BY u.email;
END;
$$;
