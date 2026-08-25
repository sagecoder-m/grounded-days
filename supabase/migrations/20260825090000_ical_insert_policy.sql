-- Let a person subscribe to their own calendar feed.
--
-- calendar_connections had select, update and delete policies but no insert:
-- every connection was created by the OAuth callback running as the service
-- role, so the client never needed to write one. A feed has no callback — the
-- URL is the whole credential — so subscribing had nowhere to go and failed with
-- "new row violates row-level security policy".
--
-- Scoped to ical on purpose. Without the provider clause this policy would also
-- let a client fabricate a google or microsoft connection row, which the sync
-- would then try to use: it would look for credentials that were never issued
-- and fail on every run. Feeds are the only kind a client has any business
-- creating, because they are the only kind with no secret to exchange.
CREATE POLICY "Users can subscribe to their own calendar feeds"
  ON public.calendar_connections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND provider = 'ical');
