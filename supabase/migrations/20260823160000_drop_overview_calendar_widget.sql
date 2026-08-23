-- Remove the full calendar board from the Overview.
--
-- "A look at today" now covers the at-a-glance case, and the full board has its
-- own page, so the Overview copy was a second, heavier calendar below the fold.
-- The component is untouched — only the Overview widget is retired.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true},
  {"key": "chart", "enabled": true},
  {"key": "goals", "enabled": true},
  {"key": "tasks", "enabled": true},
  {"key": "day", "enabled": true},
  {"key": "upcoming", "enabled": true}
]'::jsonb;

-- Existing rows still carry the key. The Overview ignores an unknown key, but
-- Profile would render a toggle for a widget that no longer exists, so strip it
-- rather than leave a control that does nothing.
UPDATE public.user_settings
SET widgets = COALESCE(
  (
    SELECT jsonb_agg(w.value ORDER BY w.ord)
      FROM jsonb_array_elements(widgets) WITH ORDINALITY AS w(value, ord)
     WHERE w.value ->> 'key' <> 'calendar'
  ),
  '[]'::jsonb
)
WHERE widgets @> '[{"key": "calendar"}]'::jsonb;
