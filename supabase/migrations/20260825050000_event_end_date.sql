-- Events can span more than one day.
--
-- An event carried a single `date`, so an all-day event's end was derived from
-- the same day it started — a conference, a trip or an exam week could not be
-- represented at all. Timed events already had starts_at/ends_at, but those are
-- instants within one day; nothing described a range of days.
--
-- Nullable rather than defaulted to `date`: NULL means "one day", which keeps
-- every existing row correct without a backfill and keeps the common case free
-- of a redundant value that could drift out of step with `date`.
ALTER TABLE public.events ADD COLUMN end_date date;

-- An end before the start is not a shorter event, it is corrupt data.
ALTER TABLE public.events
  ADD CONSTRAINT events_end_date_after_start
  CHECK (end_date IS NULL OR end_date >= date);
