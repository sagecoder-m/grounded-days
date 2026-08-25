-- Retire the "focus" widget key.
--
-- It existed for one revision, as a standalone Overview section. The timer now
-- sits inside the area-progress row, so the key orders nothing: its position in
-- the reorder list would have no effect while its switch still did, which is a
-- half-working control and worse than none.
--
-- Removed from the default and stripped from existing rows, the same way the
-- retired "tasks" key was, so Profile never renders a switch for a widget that
-- no longer decides anything.

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
     WHERE w.value ->> 'key' <> 'focus'
  ),
  '[]'::jsonb
)
WHERE widgets @> '[{"key": "focus"}]'::jsonb;
