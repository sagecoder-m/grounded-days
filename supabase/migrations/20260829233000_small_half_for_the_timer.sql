-- A shape for the timer, and only the timer.
--
-- Every other shape stretches to fill the row it sits in. The timer is a dial
-- and two fields, so given a square it filled a third of the tile and left the
-- rest empty — which reads as a widget that is broken rather than one that is
-- small. "smallHalf" is a third of the row wide, like a square, but only as
-- tall as its own contents.
--
-- Existing accounts move with it: anyone whose focus widget is sitting at a
-- size it no longer wants would otherwise keep the empty card until they
-- happened to open the size menu themselves.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "long"},
  {"key": "day", "enabled": true, "size": "square"},
  {"key": "upcoming", "enabled": true, "size": "square"},
  {"key": "focus", "enabled": true, "size": "smallHalf"},
  {"key": "river", "enabled": true, "size": "long"},
  {"key": "chart", "enabled": false, "size": "long"},
  {"key": "goals", "enabled": false, "size": "long"},
  {"key": "rhythm", "enabled": false, "size": "long"},
  {"key": "balance", "enabled": false, "size": "square"},
  {"key": "movement", "enabled": false, "size": "square"}
]'::jsonb;

-- Only the focus entry, and only where it is currently a square. Someone who
-- deliberately widened their timer to a half keeps the half.
UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           CASE
             WHEN w->>'key' = 'focus' AND w->>'size' = 'square'
               THEN jsonb_set(w, '{size}', '"smallHalf"'::jsonb)
             ELSE w
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(us.widgets) WITH ORDINALITY AS t(w, ord)
)
WHERE us.widgets @> '[{"key": "focus", "size": "square"}]'::jsonb;
