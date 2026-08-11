-- Read-only calendar import from Google Calendar and Outlook (Microsoft Graph).
--
-- Shape of the feature this supports: events are pulled in one direction only.
-- Grounded never writes back to a provider, so there is no conflict resolution
-- anywhere in this schema. The invariant that makes that safe is enforced here
-- rather than only in the UI — see the events policies at the bottom.

-- ------------------------------------------------------------- connections

-- One row per connected calendar account. Deliberately holds no tokens: this
-- table is readable by the owning user, and the browser has no business
-- holding a refresh token. Tokens live in calendar_credentials below.
CREATE TABLE public.calendar_connections (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  -- The provider's own stable account identifier (Google `sub`, Graph `id`).
  -- Email is for display only; people change it and it is a poor key.
  account_id text NOT NULL,
  account_email text,
  -- Which Grounded area imported events land in. Outlook tends to be work and
  -- Google personal, but that is a default the user can change, not a rule.
  default_area text CHECK (default_area IN ('personal', 'professional', 'education')),
  -- 'needs_reauth' is a first-class state, not an error: Google refresh tokens
  -- for an unverified app expire after 7 days, so this WILL happen routinely
  -- and the UI has to be able to say so plainly instead of failing silently.
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reauth', 'error')),
  status_detail text,
  last_synced_at timestamptz,
  -- Provider cursor for incremental sync: Google syncToken, Graph deltaLink.
  sync_cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_id)
);

CREATE INDEX calendar_connections_user_id_idx
  ON public.calendar_connections (user_id);

-- Tokens. RLS is enabled with NO policies, which means no `authenticated`
-- request can read or write this table at all — only the service role, i.e.
-- the edge functions. That is the point: the refresh token must never be
-- reachable from the browser, even the account owner's own browser.
CREATE TABLE public.calendar_credentials (
  connection_id uuid NOT NULL PRIMARY KEY
    REFERENCES public.calendar_connections (id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Short-lived record of an in-flight OAuth handshake. Rows are consumed by the
-- callback and swept by age; nothing here is useful after the exchange.
CREATE TABLE public.calendar_oauth_states (
  state text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  code_verifier text NOT NULL,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_oauth_states_created_at_idx
  ON public.calendar_oauth_states (created_at);

-- ------------------------------------------------------------------ events

-- `date` is intentionally left in place and kept populated by the sync job.
-- Every existing query, mapper and calendar view keys off it, so extending
-- around it keeps this migration's blast radius to the new columns only.
ALTER TABLE public.events
  ADD COLUMN starts_at timestamptz,
  ADD COLUMN ends_at timestamptz,
  ADD COLUMN all_day boolean NOT NULL DEFAULT true,
  ADD COLUMN source text NOT NULL DEFAULT 'local'
    CHECK (source IN ('local', 'google', 'microsoft')),
  ADD COLUMN external_id text,
  ADD COLUMN external_calendar_id text,
  ADD COLUMN connection_id uuid
    REFERENCES public.calendar_connections (id) ON DELETE CASCADE,
  ADD COLUMN location text,
  ADD COLUMN html_link text;

-- A row is either hand-made in Grounded or mirrored from a provider. There is
-- no third case, and a half-populated mirrored row would desync silently.
ALTER TABLE public.events ADD CONSTRAINT events_source_linkage_ck CHECK (
  (source = 'local' AND external_id IS NULL AND connection_id IS NULL)
  OR (source <> 'local' AND external_id IS NOT NULL AND connection_id IS NOT NULL)
);

-- Makes re-syncing an upsert rather than a duplicate factory. Recurring events
-- arrive pre-expanded from both providers, and each instance carries its own
-- id, so instances land as distinct rows without any RRULE handling here.
CREATE UNIQUE INDEX events_connection_external_idx
  ON public.events (connection_id, external_id)
  WHERE connection_id IS NOT NULL;

CREATE INDEX events_user_id_starts_at_idx
  ON public.events (user_id, starts_at);

-- ------------------------------------------------------------------- rls

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

-- Read and disconnect are the user's to make. Creating a connection is not:
-- only the OAuth callback (service role) may insert, because a connection
-- without matching credentials is a broken row. Update is allowed so the user
-- can retarget default_area from the UI.
CREATE POLICY "Users can view their own calendar connections"
  ON public.calendar_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own calendar connections"
  ON public.calendar_connections
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own calendar connections"
  ON public.calendar_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- calendar_credentials and calendar_oauth_states get no policies at all.

-- Mirrored events are read-only, enforced in the database and not just in the
-- UI. The client keeps full control of its own rows; imported rows are the
-- sync job's to own, so a UI bug cannot corrupt what the provider sent.
DROP POLICY "Users can insert their own events" ON public.events;
DROP POLICY "Users can update their own events" ON public.events;
DROP POLICY "Users can delete their own events" ON public.events;

CREATE POLICY "Users can insert their own local events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND source = 'local');
CREATE POLICY "Users can update their own local events" ON public.events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND source = 'local')
  WITH CHECK (auth.uid() = user_id AND source = 'local');
CREATE POLICY "Users can delete their own local events" ON public.events
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND source = 'local');

-- --------------------------------------------------------------- triggers

CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_calendar_credentials_updated_at
  BEFORE UPDATE ON public.calendar_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
