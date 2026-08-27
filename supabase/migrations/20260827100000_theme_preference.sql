-- Light or dark, remembered per account.
--
-- The dark palette has existed in the stylesheet since the beginning and nothing
-- ever switched it on: no toggle, no setting, no class ever written to the page.
-- People who work in the evening have been reading a cream screen in a dark room
-- this whole time, which for an app whose whole argument is "be gentler on
-- yourself" is a poor look.
--
-- Three values rather than two. "system" is the default and is not the same as
-- "light": it follows the machine, so a phone that dims itself at sunset dims
-- this too without anyone choosing anything. Storing a resolved light/dark for
-- everyone would silently opt every existing account out of that.
--
-- In user_settings beside accent and density rather than in local storage,
-- because it is a preference about how the app looks and that is where those
-- live — and because a preference that does not follow you to your other device
-- is one you have to set again on every device.

ALTER TABLE public.user_settings
  ADD COLUMN theme text NOT NULL DEFAULT 'system';

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_theme_check
  CHECK (theme IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.user_settings.theme IS
  'light, dark, or system. system follows the device and is the default.';
