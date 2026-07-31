-- Passcode lock. The hash is stored in public.user_security, which is
-- deliberately unreachable from the client: RLS is enabled with ZERO policies
-- and all grants are revoked. Every read/write goes through the SECURITY
-- DEFINER functions below, which run as the table owner and bypass RLS.
--
-- That is what makes "verified against a hash, not client-side" actually true:
-- the hash never crosses the network, so it cannot be brute-forced offline.
-- Online brute force is handled by the lockout inside verify_passcode(), since
-- a 4-8 digit code is trivially enumerable via direct RPC calls and any
-- client-side rate limit would be theatre.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.user_security (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  passcode_hash text,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose. RLS enabled + no policies = deny all,
-- even for the owning user. Revoking grants as well is belt and braces against
-- Supabase's default privileges on the public schema.
REVOKE ALL ON public.user_security FROM anon, authenticated;
GRANT ALL ON public.user_security TO service_role;

CREATE TRIGGER update_user_security_updated_at BEFORE UPDATE ON public.user_security
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.user_security IS
  'Passcode hashes. Unreachable from the client by design - access only via the SECURITY DEFINER passcode functions.';

-- Tunables, kept in one place so the functions and the UI copy agree.
--   max attempts before lockout: 5
--   backoff: 30s doubling per further failure, capped at 15 minutes
--   passcode format: 4-8 digits

-- ------------------------------------------------------------ has_passcode

CREATE OR REPLACE FUNCTION public.has_passcode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_security
    WHERE user_id = auth.uid() AND passcode_hash IS NOT NULL
  );
$$;

-- ------------------------------------------------------------- set_passcode
-- First-run only. Changing an existing passcode requires change_passcode so the
-- old one always has to be proven.

CREATE OR REPLACE FUNCTION public.set_passcode(new_passcode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  existing text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validated server-side so a weak or empty passcode cannot be stored even if
  -- the UI is bypassed.
  IF new_passcode IS NULL OR new_passcode !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'Passcode must be 4 to 8 digits';
  END IF;

  SELECT passcode_hash INTO existing FROM public.user_security WHERE user_id = uid;

  IF existing IS NOT NULL THEN
    RAISE EXCEPTION 'A passcode is already set; use change_passcode instead';
  END IF;

  INSERT INTO public.user_security (user_id, passcode_hash, failed_attempts, locked_until)
  VALUES (uid, crypt(new_passcode, gen_salt('bf', 10)), 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET passcode_hash = EXCLUDED.passcode_hash,
        failed_attempts = 0,
        locked_until = NULL;
END;
$$;

-- ---------------------------------------------------------- change_passcode

CREATE OR REPLACE FUNCTION public.change_passcode(old_passcode text, new_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  current_hash text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF new_passcode IS NULL OR new_passcode !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'Passcode must be 4 to 8 digits';
  END IF;

  SELECT passcode_hash INTO current_hash FROM public.user_security WHERE user_id = uid;

  IF current_hash IS NULL THEN
    RAISE EXCEPTION 'No passcode is set yet';
  END IF;

  IF current_hash <> crypt(old_passcode, current_hash) THEN
    RETURN false;
  END IF;

  UPDATE public.user_security
  SET passcode_hash = crypt(new_passcode, gen_salt('bf', 10)),
      failed_attempts = 0,
      locked_until = NULL
  WHERE user_id = uid;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------- verify_passcode
-- Returns { ok, reason, locked_until, attempts_remaining }.
-- reason is one of: ok | wrong | locked | not_set

CREATE OR REPLACE FUNCTION public.verify_passcode(candidate text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  max_attempts constant integer := 5;
  uid uuid := auth.uid();
  current_hash text;
  current_lock timestamptz;
  next_attempts integer;
  next_lock timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT passcode_hash, locked_until
    INTO current_hash, current_lock
  FROM public.user_security
  WHERE user_id = uid;

  IF current_hash IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'not_set',
      'locked_until', NULL, 'attempts_remaining', max_attempts
    );
  END IF;

  -- Already locked out: bail before hashing so a locked account costs nothing.
  IF current_lock IS NOT NULL AND current_lock > now() THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'locked_until', current_lock, 'attempts_remaining', 0
    );
  END IF;

  IF current_hash = crypt(candidate, current_hash) THEN
    UPDATE public.user_security
    SET failed_attempts = 0, locked_until = NULL
    WHERE user_id = uid;

    RETURN jsonb_build_object(
      'ok', true, 'reason', 'ok',
      'locked_until', NULL, 'attempts_remaining', max_attempts
    );
  END IF;

  -- Wrong passcode. Count it, and from the 5th failure start an exponential
  -- lockout: 30s, 60s, 120s, ... capped at 15 minutes.
  UPDATE public.user_security
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN failed_attempts + 1 >= max_attempts THEN
          now() + LEAST(
            power(2, failed_attempts + 1 - max_attempts) * interval '30 seconds',
            interval '15 minutes'
          )
        ELSE NULL
      END
  WHERE user_id = uid
  RETURNING failed_attempts, locked_until INTO next_attempts, next_lock;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', CASE WHEN next_lock IS NOT NULL THEN 'locked' ELSE 'wrong' END,
    'locked_until', next_lock,
    'attempts_remaining', GREATEST(max_attempts - next_attempts, 0)
  );
END;
$$;

-- ------------------------------------------------------------------- grants
-- Functions are EXECUTE-able by PUBLIC by default, so revoking first matters.

REVOKE ALL ON FUNCTION public.has_passcode() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_passcode(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.change_passcode(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.verify_passcode(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.has_passcode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_passcode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_passcode(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_passcode(text) TO authenticated;
