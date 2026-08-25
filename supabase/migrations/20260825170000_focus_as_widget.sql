-- Make the focus timer a widget again, with a place and a size of its own.
--
-- It was a widget, then became a setting that pinned it inside the area-progress
-- row. That was a mistake: sharing a row meant it had to match a progress card's
-- height, so it stretched to 838px at half width with a 104px dial floating in
-- the middle of it. Nothing about it was to scale, and it dragged the areas row
-- out of scale with it.
--
-- As a widget it gets what every other widget has — a position, a size, and one
-- switch that works. Appended rather than inserted, so nobody's existing order
-- is rewritten; it lands last and can be dragged anywhere.
--
-- Defaults to "square" because that is the shape a dial wants. Everything else
-- stays "wide".

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "wide"},
  {"key": "chart", "enabled": true, "size": "wide"},
  {"key": "goals", "enabled": true, "size": "wide"},
  {"key": "day", "enabled": true, "size": "wide"},
  {"key": "focus", "enabled": true, "size": "square"},
  {"key": "upcoming", "enabled": true, "size": "wide"}
]'::jsonb;

-- show_focus_timer was the switch while the timer was a setting. Someone who
-- turned it off meant "I do not want this on my Overview", and that intent
-- should survive becoming a widget rather than silently reappearing.
UPDATE public.user_settings
SET widgets = widgets || jsonb_build_array(
      jsonb_build_object(
        'key', 'focus',
        'enabled', COALESCE(show_focus_timer, true),
        'size', 'square'
      )
    )
WHERE NOT (widgets @> '[{"key": "focus"}]'::jsonb);

-- The column is left in place rather than dropped. Nothing reads it after this,
-- and dropping a column is the one migration that cannot be walked back if a
-- deploy has to be rolled back to a build that still expects it.
COMMENT ON COLUMN public.user_settings.show_focus_timer IS
  'Retired. Superseded by the "focus" entry in widgets; kept so a rollback has somewhere to land.';
