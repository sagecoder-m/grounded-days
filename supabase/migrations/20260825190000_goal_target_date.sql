-- Give a goal somewhere to sit on the calendar.
--
-- Goals had no date of any kind, which is why they could not be drawn on the
-- grid — and why the calendar's own "add a goal" already accepted a date and
-- then quietly discarded it.
--
-- Nullable, and staying nullable. A goal without a target date is the normal
-- case, not an incomplete one: "get steadier at sleeping" is a real goal with no
-- deadline, and an app built to avoid manufactured pressure should not require
-- one. NOT NULL with a default would have invented a deadline for every goal
-- that already exists.
--
-- date rather than timestamptz: a target is a day you are aiming at, not an
-- instant. The same reason tasks.date is a date, and it keeps both out of the
-- timezone arithmetic that a timestamptz drags in.

ALTER TABLE public.goals ADD COLUMN target_date date;

-- Partial: most goals will have no target, and an index over a column that is
-- mostly NULL is mostly dead weight. This one only covers the rows a calendar
-- query actually asks for.
CREATE INDEX goals_target_date_idx ON public.goals (user_id, target_date)
  WHERE target_date IS NOT NULL;

COMMENT ON COLUMN public.goals.target_date IS
  'Optional day the goal is aimed at. NULL is normal and means no deadline; nothing requires one.';
