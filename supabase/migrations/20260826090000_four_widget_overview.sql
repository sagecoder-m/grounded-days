-- Cut the Overview to four widgets, and add the rhythm river.
--
-- A new tester was landing on nine panels, most of them empty, with no
-- onboarding. For anyone whose difficulty is starting rather than doing, that is
-- the worst possible opening: maximum choice, zero direction. Four is what a day
-- actually needs — what is on today, what is coming, something to focus with, and
-- one picture of how it has been going.
--
-- Nothing is deleted. The others are switched off, so anyone who wants the
-- fortnight chart or the area cards can turn them back on in Profile, and their
-- chosen size and position are still there when they do.
--
-- Thirds across the top and the river full width beneath divides evenly into the
-- six-column board, so the default arrangement has no gaps in it.

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "wide"},
  {"key": "day", "enabled": true, "size": "third"},
  {"key": "upcoming", "enabled": true, "size": "third"},
  {"key": "focus", "enabled": true, "size": "third"},
  {"key": "river", "enabled": true, "size": "wide"},
  {"key": "chart", "enabled": false, "size": "wide"},
  {"key": "goals", "enabled": false, "size": "wide"},
  {"key": "rhythm", "enabled": false, "size": "wide"},
  {"key": "balance", "enabled": false, "size": "square"},
  {"key": "movement", "enabled": false, "size": "square"}
]'::jsonb;

-- Give every existing account the river, appended so nobody's order is rewritten.
UPDATE public.user_settings
SET widgets = widgets || '[{"key": "river", "enabled": true, "size": "wide"}]'::jsonb
WHERE NOT (widgets @> '[{"key": "river"}]'::jsonb);

/*
  Switch off the five the river replaces, and set the three keepers to thirds.

  jsonb_agg over the existing array rather than a wholesale overwrite, so the
  order each person arranged survives. Anyone who had already turned one of these
  off stays off; anyone who had deliberately turned one on will find it off and
  can turn it back — worth it to give everyone the calmer default, and reversible
  in two clicks.
*/
UPDATE public.user_settings
SET widgets = COALESCE(
  (
    SELECT jsonb_agg(
             CASE
               WHEN w.value->>'key' IN ('chart', 'goals', 'rhythm', 'balance', 'movement')
                 THEN jsonb_set(w.value, '{enabled}', 'false'::jsonb)
               WHEN w.value->>'key' IN ('day', 'upcoming', 'focus')
                 THEN jsonb_set(jsonb_set(w.value, '{enabled}', 'true'::jsonb), '{size}', '"third"'::jsonb)
               ELSE w.value
             END
             ORDER BY w.ord
           )
      FROM jsonb_array_elements(widgets) WITH ORDINALITY AS w(value, ord)
  ),
  widgets
);
