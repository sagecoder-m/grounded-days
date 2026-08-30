-- Four widget shapes instead of six, and names that mean what they say.
--
-- The board could not line up, and the sizes were why. "threeQuarter" (nine
-- columns) and "third" (four) do not divide into the same grid as halves, so
-- any row mixing them left a gap that nothing could fill. The brief asks for
-- rows that always align, which needs shapes measured in one unit:
--
--   long    twelve columns, one unit tall
--   half    six columns, one unit tall
--   square  four columns, one unit tall
--   tall    four columns, two units tall — exactly two squares stacked
--
-- "square" also had to be taken off its old meaning. It meant *half width* and
-- the menu labelled it "Half width", which left no name for an actual square.
-- So square -> half here, and the old "third" becomes the new square. Reading
-- the old value at face value would have shrunk every half-width tile someone
-- had deliberately widened.
--
-- The app maps these on read too (LEGACY_SIZES in src/lib/db/mappers.ts) and
-- that mapping stays: a settings row is only rewritten when someone changes
-- something, so a row nobody touches after this can still be read correctly
-- even if this backfill never reached it.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "long"},
  {"key": "day", "enabled": true, "size": "square"},
  {"key": "upcoming", "enabled": true, "size": "square"},
  {"key": "focus", "enabled": true, "size": "square"},
  {"key": "river", "enabled": true, "size": "long"},
  {"key": "chart", "enabled": false, "size": "long"},
  {"key": "goals", "enabled": false, "size": "long"},
  {"key": "rhythm", "enabled": false, "size": "long"},
  {"key": "balance", "enabled": false, "size": "square"},
  {"key": "movement", "enabled": false, "size": "square"}
]'::jsonb;

-- Rewrite each stored entry's size, leaving key, enabled and the order alone.
-- jsonb_agg over the existing array with ordinality, so the arrangement each
-- person dragged into place survives exactly as it was.
UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           jsonb_set(
             w,
             '{size}',
             to_jsonb(
               CASE w->>'size'
                 WHEN 'wide'         THEN 'long'
                 WHEN 'threeQuarter' THEN 'long'
                 WHEN 'square'       THEN 'half'
                 WHEN 'third'        THEN 'square'
                 WHEN 'taller'       THEN 'tall'
                 WHEN 'tall'         THEN 'tall'
                 WHEN 'long'         THEN 'long'
                 WHEN 'half'         THEN 'half'
                 -- Rows written before sizes existed have no size at all, and
                 -- rendered full width, so long is what they already looked like.
                 ELSE 'long'
               END
             )
           )
           ORDER BY ord
         )
  FROM jsonb_array_elements(us.widgets) WITH ORDINALITY AS t(w, ord)
)
WHERE jsonb_typeof(us.widgets) = 'array'
  AND jsonb_array_length(us.widgets) > 0;
