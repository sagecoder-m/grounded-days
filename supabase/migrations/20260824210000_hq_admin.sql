-- HQ: an admin role, privacy-bounded usage telemetry, and client error capture.
--
-- Built for a three-month pilot. The questions the pilot has to answer are:
-- which sections earn use and which don't (engagement), do new accounts reach a
-- first meaningful action (activation), do people come back (retention), and
-- where does the app break (reliability). Everything here exists to answer one
-- of those four and nothing else.
--
-- The privacy line, stated once and enforced in the schema: telemetry carries
-- an event NAME from a fixed allowlist, a route, and a timestamp. No titles, no
-- bodies, no free-text payload column at all — the column that would hold
-- personal content does not exist, which beats promising not to fill it.

-- ------------------------------------------------------------------ admins

CREATE TABLE public.admin_users (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- A user may ask only "am I an admin". Non-admins simply see zero rows.
-- There are deliberately no insert/update/delete policies: admins are appointed
-- by migration or service role, never from the client.
CREATE POLICY "Users can check their own admin status" ON public.admin_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- SECURITY DEFINER so other tables' policies can call it without granting
-- everyone read access to admin_users itself.
CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

-- Emails that should hold admin from the moment their account exists. Kept as a
-- table (not a hardcoded seed) so the signup trigger below can promote an admin
-- whose account is created after this migration runs — the HQ account may not
-- have signed up yet.
CREATE TABLE public.admin_emails (
  email text NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
-- No policies at all: invisible to every client role, service role only.

INSERT INTO public.admin_emails (email) VALUES ('eliaquineb@gmail.com');

-- Promote any admin email whose account already exists...
INSERT INTO public.admin_users (user_id)
SELECT u.id FROM auth.users u
JOIN public.admin_emails a ON lower(u.email) = lower(a.email)
ON CONFLICT (user_id) DO NOTHING;

-- ...and any that signs up later.
CREATE FUNCTION public.promote_admin_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails WHERE lower(email) = lower(NEW.email)) THEN
    INSERT INTO public.admin_users (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER promote_admin_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.promote_admin_on_signup();

-- ---------------------------------------------------------------- telemetry

CREATE TABLE public.usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Short, machine-shaped names only ("page_view", "task_add"). The length cap
  -- and charset check make the column useless for smuggling prose.
  event text NOT NULL CHECK (event ~ '^[a-z0-9_]{1,40}$'),
  route text NOT NULL CHECK (char_length(route) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usage_events_created_at_idx ON public.usage_events (created_at);
CREATE INDEX usage_events_user_id_idx ON public.usage_events (user_id, created_at);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own usage events" ON public.usage_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Only admins read, and nobody edits history: no update/delete policies.
CREATE POLICY "Admins can read usage events" ON public.usage_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- ------------------------------------------------------------ client errors

CREATE TABLE public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Kept when the account is deleted (set null) — an error report is about the
  -- app, not the person.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(message) <= 500),
  stack text CHECK (char_length(stack) <= 4000),
  route text NOT NULL CHECK (char_length(route) <= 80),
  user_agent text CHECK (char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_errors_created_at_idx ON public.client_errors (created_at);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report their own errors" ON public.client_errors
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read errors" ON public.client_errors
  FOR SELECT TO authenticated USING (public.is_admin());
