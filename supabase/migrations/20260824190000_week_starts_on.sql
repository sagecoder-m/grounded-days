-- Let people choose which day their week starts on.
--
-- The habit grid was not showing a week at all — it showed the last seven days
-- ending today, so on a Monday the columns read T W T F S S M. That is a
-- rolling window, which is a different thing from "this week" and makes the
-- same habit sit in a different column every day.
--
-- Stored as the day number date-fns and DayFlow both already speak (0 = Sunday,
-- 1 = Monday, 6 = Saturday) rather than a label, so it can be handed straight to
-- startOfWeek() and to DayFlow's startOfWeek view config without a lookup table
-- in between. Constrained to those three because they are the conventions that
-- actually exist; a week starting Wednesday is a data-entry error, not a
-- preference.
--
-- Default is Monday, which is the ISO week and what the grid should have been
-- doing from the start.

ALTER TABLE public.user_settings
  ADD COLUMN week_starts_on smallint NOT NULL DEFAULT 1;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_week_starts_on_valid
  CHECK (week_starts_on IN (0, 1, 6));

-- Also retires the "tasks" widget, which the Overview no longer renders: its
-- today-tasks section was folded into "A look at today" so the same task could
-- not appear twice on one screen. The column default still seeded the key for
-- every new row, and while Profile filters unknown keys out of its switch list,
-- seeding a key nothing reads is just future confusion.
ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true},
  {"key": "chart", "enabled": true},
  {"key": "goals", "enabled": true},
  {"key": "day", "enabled": true},
  {"key": "upcoming", "enabled": true}
]'::jsonb;

UPDATE public.user_settings
SET widgets = COALESCE(
  (
    SELECT jsonb_agg(w.value ORDER BY w.ord)
      FROM jsonb_array_elements(widgets) WITH ORDINALITY AS w(value, ord)
     WHERE w.value ->> 'key' <> 'tasks'
  ),
  '[]'::jsonb
)
WHERE widgets @> '[{"key": "tasks"}]'::jsonb;
