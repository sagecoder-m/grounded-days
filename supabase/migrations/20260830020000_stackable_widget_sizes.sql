-- Give the shapes back, so tiles can stack.
--
-- The previous migration flattened everything to a square, and that made a
-- layout impossible rather than merely unavailable: with every tile one unit
-- tall, a column of small tiles cannot sit beside a long list, because each
-- one lands in a row of its own and every row is as tall as the list in it.
--
-- Rows now have a fixed unit (a square), and the shapes are measured in it:
--
--   long       the full row, one unit.  Charts — an x axis is time, and time
--              needs length; this is the shape a chart is normally in.
--   half       half the row, one unit.
--   square     a third of the row, one unit, and genuinely 1:1.
--   tall       a third of the row, three units. Lists — and the shape a stack
--              of three squares sits level beside.
--   smallHalf  a third of the row, its own height. The timer.
--
-- The defaults put the two lists side by side as talls, with the timer and the
-- river stacked in the third column, which is the arrangement that was asked
-- for: timer on top, graph below it.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "long"},
  {"key": "day", "enabled": true, "size": "tall"},
  {"key": "upcoming", "enabled": true, "size": "tall"},
  {"key": "focus", "enabled": true, "size": "smallHalf"},
  {"key": "river", "enabled": true, "size": "square"},
  {"key": "chart", "enabled": false, "size": "long"},
  {"key": "goals", "enabled": false, "size": "square"},
  {"key": "rhythm", "enabled": false, "size": "square"},
  {"key": "balance", "enabled": false, "size": "square"},
  {"key": "movement", "enabled": false, "size": "square"}
]'::jsonb;

/*
  Put existing accounts into the same arrangement.

  Every widget was flattened to a square by the last migration, so there is no
  per-account intent left to preserve here — restoring the shape each widget
  wants is the only thing that can be done, and it is what the defaults above
  say. Only the size changes: key, enabled and the order are untouched, so
  nobody's arrangement is rewritten.
*/
UPDATE public.user_settings AS us
SET widgets = (
  SELECT jsonb_agg(
           jsonb_set(
             w,
             '{size}',
             to_jsonb(
               CASE w->>'key'
                 WHEN 'greeting' THEN 'long'
                 WHEN 'day'      THEN 'tall'
                 WHEN 'upcoming' THEN 'tall'
                 WHEN 'focus'    THEN 'smallHalf'
                 WHEN 'chart'    THEN 'long'
                 ELSE 'square'
               END
             )
           )
           ORDER BY ord
         )
  FROM jsonb_array_elements(us.widgets) WITH ORDINALITY AS t(w, ord)
)
WHERE jsonb_typeof(us.widgets) = 'array'
  AND jsonb_array_length(us.widgets) > 0;
