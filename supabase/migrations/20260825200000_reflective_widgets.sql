-- Three reflective panels on the Overview: rhythm, balance, movement.
--
-- The Overview only renders widget keys present in a person's saved array, so
-- adding sections in code is not enough — every existing account would keep its
-- old list and never see them.
--
-- Appended rather than inserted at a position, so nobody's arrangement is
-- rewritten. They land last and can be dragged and resized like anything else.
--
-- Sizes chosen for what each one needs rather than uniformly:
--   rhythm    wide   — twelve weeks of columns needs the room; at half width the
--                      squares get too small to read as a rhythm.
--   balance   square — a streamgraph reads fine narrow, and pairing it beside
--                      movement puts the two reflective panels side by side.
--   movement  square — three small cards, which is exactly one half-width row.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "wide"},
  {"key": "chart", "enabled": true, "size": "wide"},
  {"key": "goals", "enabled": true, "size": "wide"},
  {"key": "day", "enabled": true, "size": "wide"},
  {"key": "focus", "enabled": true, "size": "square"},
  {"key": "upcoming", "enabled": true, "size": "wide"},
  {"key": "rhythm", "enabled": true, "size": "wide"},
  {"key": "balance", "enabled": true, "size": "square"},
  {"key": "movement", "enabled": true, "size": "square"}
]'::jsonb;

-- Each added independently, so an account that somehow has one already does not
-- get a duplicate and still receives the others.
UPDATE public.user_settings
SET widgets = widgets || '[{"key": "rhythm", "enabled": true, "size": "wide"}]'::jsonb
WHERE NOT (widgets @> '[{"key": "rhythm"}]'::jsonb);

UPDATE public.user_settings
SET widgets = widgets || '[{"key": "balance", "enabled": true, "size": "square"}]'::jsonb
WHERE NOT (widgets @> '[{"key": "balance"}]'::jsonb);

UPDATE public.user_settings
SET widgets = widgets || '[{"key": "movement", "enabled": true, "size": "square"}]'::jsonb
WHERE NOT (widgets @> '[{"key": "movement"}]'::jsonb);
