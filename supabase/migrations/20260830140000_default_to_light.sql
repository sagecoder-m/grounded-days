-- Light by default.
--
-- The default was 'system', which follows the machine. That is a reasonable
-- default in the abstract and the wrong one here: grounded is a cream-and-sage
-- app, the light palette is the one it was designed in, and a first visit on a
-- laptop set to dark showed the version nobody had chosen.
--
-- Existing accounts still on 'system' move with it, since none of them chose
-- that — it is what they were given. Anyone who picked light or dark
-- deliberately keeps their choice.
ALTER TABLE public.user_settings ALTER COLUMN theme SET DEFAULT 'light';

UPDATE public.user_settings SET theme = 'light' WHERE theme = 'system';
