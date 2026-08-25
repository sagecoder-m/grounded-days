-- iCal (.ics) feed subscriptions.
--
-- The third calendar source, and the first without OAuth. A published .ics URL
-- is the whole credential: there is no consent screen, no token to refresh, and
-- nothing to re-authorise weekly. That makes it the most reliable of the three
-- for the pilot, and the only one that works for a university timetable or a
-- fixtures list that was never going to hand out API access.
--
-- It reuses calendar_connections rather than getting its own table, so one
-- status column, one sync path, one read-only rule and one row-level policy set
-- cover all three providers. Two columns had to give a little to allow that.

-- 'ical' joins the provider and source vocabularies.
ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS calendar_connections_provider_check;
ALTER TABLE public.calendar_connections
  ADD CONSTRAINT calendar_connections_provider_check
  CHECK (provider IN ('google', 'microsoft', 'ical'));

-- calendar_credentials deliberately untouched: it keys off connection_id and has
-- no provider column of its own. An ical connection simply has no credentials
-- row, because a feed URL is the credential and it lives on the connection.

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_source_check
  CHECK (source IN ('local', 'google', 'microsoft', 'ical'));

-- Where to fetch. Only ever set for an ical connection; the OAuth providers
-- carry their credentials in calendar_credentials instead.
ALTER TABLE public.calendar_connections ADD COLUMN feed_url text;

-- A feed is required for ical and meaningless for the others, so the shape is
-- enforced rather than left to whichever code path happens to write the row.
-- https only: an http feed would send the URL — which is the credential — in
-- clear text.
ALTER TABLE public.calendar_connections
  ADD CONSTRAINT calendar_connections_feed_url_shape
  CHECK (
    (provider = 'ical' AND feed_url IS NOT NULL AND feed_url LIKE 'https://%')
    OR (provider <> 'ical' AND feed_url IS NULL)
  );

-- account_id is NOT NULL and unique per (user, provider, account). A feed has no
-- account, so the sync writes the feed's own URL there; that also makes
-- subscribing to the same feed twice impossible, which the unique index now
-- enforces for free rather than needing a duplicate check in application code.
COMMENT ON COLUMN public.calendar_connections.account_id IS
  'Provider account identifier. For an ical connection this is the feed URL, which makes the (user_id, provider, account_id) unique index reject subscribing to the same feed twice.';
