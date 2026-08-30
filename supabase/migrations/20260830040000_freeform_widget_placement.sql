-- Widgets get a position, not a shape name.
--
-- Every previous vocabulary — wide/square/tall/third/threeQuarter/taller, then
-- long/half/square/tall, then square/smallHalf — described what a widget was
-- allowed to be. None of them could say where it sits, so the board decided
-- that on the user's behalf and kept getting it wrong. x/y/w/h says only what
-- was actually asked for: this widget, here, this big.
--
-- Units are columns on a 36-wide board (12 = a third, 18 = a half, 36 = full)
-- and rows of 20px. Units rather than pixels, so a saved layout survives a
-- window resize.
--
-- A name cannot be turned into a position, so there is nothing to convert: each
-- row is given the default arrangement and becomes a real placement the moment
-- anything is dragged. `enabled` is carried across, because that is the one
-- part of the old row that was a decision somebody made. The app does the same
-- on read (toWidgets in src/lib/db/mappers.ts) for any row this never reaches.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true,  "x": 0,  "y": 0,  "w": 36, "h": 5},
  {"key": "day",      "enabled": true,  "x": 0,  "y": 5,  "w": 12, "h": 18},
  {"key": "upcoming", "enabled": true,  "x": 12, "y": 5,  "w": 12, "h": 18},
  {"key": "focus",    "enabled": true,  "x": 24, "y": 5,  "w": 12, "h": 7},
  {"key": "river",    "enabled": true,  "x": 24, "y": 12, "w": 12, "h": 11},
  {"key": "chart",    "enabled": false, "x": 0,  "y": 23, "w": 36, "h": 11},
  {"key": "goals",    "enabled": false, "x": 0,  "y": 34, "w": 18, "h": 9},
  {"key": "rhythm",   "enabled": false, "x": 18, "y": 34, "w": 18, "h": 9},
  {"key": "balance",  "enabled": false, "x": 0,  "y": 43, "w": 12, "h": 11},
  {"key": "movement", "enabled": false, "x": 12, "y": 43, "w": 18, "h": 9}
]'::jsonb;

UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           d.placement
             || jsonb_build_object(
                  'enabled',
                  COALESCE(
                    (
                      SELECT (e->>'enabled')::boolean
                      FROM jsonb_array_elements(us.widgets) AS e
                      WHERE e->>'key' = d.placement->>'key'
                      LIMIT 1
                    ),
                    (d.placement->>'enabled')::boolean
                  )
                )
           ORDER BY d.ord
         )
  FROM jsonb_array_elements('[
    {"key": "greeting", "enabled": true,  "x": 0,  "y": 0,  "w": 36, "h": 5},
    {"key": "day",      "enabled": true,  "x": 0,  "y": 5,  "w": 12, "h": 18},
    {"key": "upcoming", "enabled": true,  "x": 12, "y": 5,  "w": 12, "h": 18},
    {"key": "focus",    "enabled": true,  "x": 24, "y": 5,  "w": 12, "h": 7},
    {"key": "river",    "enabled": true,  "x": 24, "y": 12, "w": 12, "h": 11},
    {"key": "chart",    "enabled": false, "x": 0,  "y": 23, "w": 36, "h": 11},
    {"key": "goals",    "enabled": false, "x": 0,  "y": 34, "w": 18, "h": 9},
    {"key": "rhythm",   "enabled": false, "x": 18, "y": 34, "w": 18, "h": 9},
    {"key": "balance",  "enabled": false, "x": 0,  "y": 43, "w": 12, "h": 11},
    {"key": "movement", "enabled": false, "x": 12, "y": 43, "w": 18, "h": 9}
  ]'::jsonb) WITH ORDINALITY AS d(placement, ord)
)
WHERE jsonb_typeof(us.widgets) = 'array'
  -- Only rows still on a named size. An entry carrying an x already has a real
  -- position, and that is somebody's arrangement — rewriting it back to the
  -- default would be the worst thing running this twice could do.
  AND NOT (us.widgets -> 0 ? 'x');
