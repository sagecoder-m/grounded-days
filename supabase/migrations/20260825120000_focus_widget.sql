-- Put the focus timer on the Overview.
--
-- The Overview renders only the widget keys present in a person's saved array,
-- so adding a section in code is not enough: without this, every existing
-- account would keep its old list and the timer would never appear for anyone
-- who already had settings — which is everyone.
--
-- Appended rather than inserted at a position, so nobody's arrangement is
-- rewritten. It lands last and can be dragged wherever they want it.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true},
  {"key": "chart", "enabled": true},
  {"key": "goals", "enabled": true},
  {"key": "day", "enabled": true},
  {"key": "focus", "enabled": true},
  {"key": "upcoming", "enabled": true}
]'::jsonb;

UPDATE public.user_settings
SET widgets = widgets || '[{"key": "focus", "enabled": true}]'::jsonb
WHERE NOT (widgets @> '[{"key": "focus"}]'::jsonb);
