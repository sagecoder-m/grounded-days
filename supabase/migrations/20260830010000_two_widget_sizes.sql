-- Two widget shapes: square, and small half for the timer.
--
-- Six became four; four is now two. Every shape other than a square was a way
-- for one tile to be a different height from its neighbours, and every round of
-- this has come back to the same complaint — the board does not line up. A
-- board made of one square, three across, cannot fail to.
--
-- "smallHalf" stays as the single exception, because a dial and two fields have
-- nothing to do with the bottom half of a square.
--
-- Note that the old "square" meant *half width* (the menu said so). Its landing
-- on a name it used to have is a coincidence; it is not the same shape. That
-- does not matter here, since everything lands on square either way.
--
-- The app maps all of these on read as well (LEGACY_SIZES in
-- src/lib/db/mappers.ts) and that mapping stays: a settings row is only
-- rewritten when someone changes something, so a row this backfill never
-- reaches still renders correctly.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "square"},
  {"key": "day", "enabled": true, "size": "square"},
  {"key": "upcoming", "enabled": true, "size": "square"},
  {"key": "focus", "enabled": true, "size": "smallHalf"},
  {"key": "river", "enabled": true, "size": "square"},
  {"key": "chart", "enabled": false, "size": "square"},
  {"key": "goals", "enabled": false, "size": "square"},
  {"key": "rhythm", "enabled": false, "size": "square"},
  {"key": "balance", "enabled": false, "size": "square"},
  {"key": "movement", "enabled": false, "size": "square"}
]'::jsonb;

-- Everything becomes a square except an entry already sitting at smallHalf,
-- which is the timer and is left where it is. Order and enabled are untouched,
-- so nobody's arrangement is rewritten.
UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           jsonb_set(
             w,
             '{size}',
             to_jsonb(CASE WHEN w->>'size' = 'smallHalf' THEN 'smallHalf' ELSE 'square' END)
           )
           ORDER BY ord
         )
  FROM jsonb_array_elements(us.widgets) WITH ORDINALITY AS t(w, ord)
)
WHERE jsonb_typeof(us.widgets) = 'array'
  AND jsonb_array_length(us.widgets) > 0;
