-- Let people arrange the Overview themselves.
--
-- Widgets were a fixed vertical stack of full-width sections: the order was
-- yours, the shape was not. Two things change that. Each widget now carries a
-- size, so a square can sit beside a square and a wide one can span the row —
-- area progress next to the fortnight chart, if that is how someone reads their
-- own week. And the focus timer gets a real switch instead of the phantom
-- reorder entry it briefly had.
--
-- "wide" is the default for every existing widget, so nobody's page rearranges
-- itself on deploy. The freedom is opt-in, one widget at a time.

ALTER TABLE public.user_settings
  ADD COLUMN show_focus_timer boolean NOT NULL DEFAULT true;

-- Stamp a size onto every existing entry that lacks one. jsonb_agg rebuilds the
-- array in order, so arrangements survive.
UPDATE public.user_settings
SET widgets = COALESCE(
  (
    SELECT jsonb_agg(
             CASE WHEN w.value ? 'size' THEN w.value
                  ELSE w.value || '{"size": "wide"}'::jsonb END
             ORDER BY w.ord
           )
      FROM jsonb_array_elements(widgets) WITH ORDINALITY AS w(value, ord)
  ),
  '[]'::jsonb
);

ALTER TABLE public.user_settings ALTER COLUMN widgets SET DEFAULT '[
  {"key": "greeting", "enabled": true, "size": "wide"},
  {"key": "chart", "enabled": true, "size": "wide"},
  {"key": "goals", "enabled": true, "size": "wide"},
  {"key": "day", "enabled": true, "size": "wide"},
  {"key": "upcoming", "enabled": true, "size": "wide"}
]'::jsonb;
