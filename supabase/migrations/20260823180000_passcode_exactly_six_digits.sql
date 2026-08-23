-- Require passcodes to be exactly six digits.
--
-- set_passcode and change_passcode accepted four to eight, but the unlock
-- screen renders a fixed six-slot input that submits on the sixth character.
-- Anything else could be stored and then never typed. That is not theoretical:
-- the demo account was seeded with a four-digit code and locked itself out.
--
-- This changes validation only, which runs when a passcode is SET. verify_passcode
-- compares a hash and is untouched, so no existing passcode stops working —
-- an account holding a non-six-digit code was already unable to reach the app
-- through the UI, and can now set a usable one.

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

  -- Validated server-side so a weak or unusable passcode cannot be stored even
  -- if the UI is bypassed. Six exactly, matching the unlock screen.
  IF new_passcode IS NULL OR new_passcode !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Passcode must be exactly 6 digits';
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

  IF new_passcode IS NULL OR new_passcode !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'Passcode must be exactly 6 digits';
  END IF;

  SELECT passcode_hash INTO current_hash FROM public.user_security WHERE user_id = uid;

  IF current_hash IS NULL THEN
    RAISE EXCEPTION 'No passcode is set yet';
  END IF;

  -- The OLD code is compared with no length rule on purpose: an account holding
  -- a legacy four-digit passcode must still be able to change to a valid one.
  -- Returning false rather than raising is the existing contract — the UI
  -- distinguishes "wrong code" from "something broke" by exactly this.
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

-- Re-assert grants: CREATE OR REPLACE keeps existing ones, but being explicit
-- means this file can be read on its own without checking the original.
REVOKE ALL ON FUNCTION public.set_passcode(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.change_passcode(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_passcode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_passcode(text, text) TO authenticated;
