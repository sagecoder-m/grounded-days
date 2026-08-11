-- Read-only share links: let someone without an account see a chosen slice of
-- one user's Grounded data.
--
-- Two decisions carry the security of this feature:
--
-- 1. The anon role gets NO access to any table here or elsewhere. A share is
--    served entirely by the share-view edge function using the service role,
--    which decides field by field what leaves the database. There is therefore
--    no new RLS surface for an anonymous reader to probe.
--
-- 2. Only a HASH of the token is stored. The raw token exists in the URL and
--    nowhere else, so a dump of this table yields no working links. It also
--    means the link can be shown to its creator exactly once, at creation.

CREATE TABLE public.share_links (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- SHA-256 of the raw token, hex encoded. Never the token itself.
  token_hash text NOT NULL UNIQUE,
  -- Something like "Mum" or "Georgetown advisor", so a list of links is
  -- meaningful months later when deciding what to revoke.
  label text,
  -- Which areas this link may reveal. Empty would expose nothing, which is a
  -- pointless link, so at least one is required. Habits have no area column and
  -- belong to Personal, so they travel with 'personal' only.
  areas text[] NOT NULL CHECK (
    array_length(areas, 1) >= 1
    AND areas <@ ARRAY['personal', 'professional', 'education']::text[]
  ),
  -- Null means no expiry. The UI defaults to 7 days rather than never.
  expires_at timestamptz,
  revoked_at timestamptz,
  -- Surfaced in the UI so the owner can notice a link being used more than
  -- expected, which is the main signal that a link has been passed on.
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX share_links_user_id_idx ON public.share_links (user_id);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- Owners manage their own links. There is deliberately no policy for anon:
-- resolving a token is the edge function's job, not a client query's.
CREATE POLICY "Users can view their own share links" ON public.share_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own share links" ON public.share_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own share links" ON public.share_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own share links" ON public.share_links
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_share_links_updated_at BEFORE UPDATE ON public.share_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Counting a view has to be atomic: read-then-write from the function would
-- lose increments whenever a link is opened twice at once.
CREATE OR REPLACE FUNCTION public.record_share_view(link_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.share_links
     SET view_count = view_count + 1,
         last_viewed_at = now()
   WHERE id = link_id;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- let an anonymous caller inflate another user's view counter over RPC.
REVOKE EXECUTE ON FUNCTION public.record_share_view(uuid) FROM PUBLIC;
