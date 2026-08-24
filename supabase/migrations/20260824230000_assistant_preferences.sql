-- Let each person tell the assistant how to work with them.
--
-- "Ready for any client" cannot mean one prompt tuned to one person. The base
-- prompt carries what is true for everyone using this app (no shaming, one small
-- step, brevity); these three columns carry what is true for this person, and
-- they are the client's own words rather than anything inferred about them.
--
-- Deliberately a stated preference and not a learned profile. Watching someone's
-- behaviour to guess their communication style is both worse — the app cannot see
-- why a week was slow — and a quiet expansion of what the assistant knows. Asking
-- is more accurate and keeps the person in charge of their own brief.

ALTER TABLE public.user_settings
  ADD COLUMN assistant_tone text NOT NULL DEFAULT 'gentle',
  ADD COLUMN assistant_length text NOT NULL DEFAULT 'brief',
  -- Free text, but bounded: long enough for a couple of real sentences, short
  -- enough that it cannot become a second journal or crowd out the actual
  -- context in the prompt.
  ADD COLUMN assistant_notes text NOT NULL DEFAULT '';

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_assistant_tone_valid
  CHECK (assistant_tone IN ('gentle', 'neutral', 'direct'));

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_assistant_length_valid
  CHECK (assistant_length IN ('brief', 'balanced', 'thorough'));

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_assistant_notes_length
  CHECK (char_length(assistant_notes) <= 600);
