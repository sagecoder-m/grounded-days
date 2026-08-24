-- Daily journal with a mood tag and a gratitude line.
--
-- One entry per day rather than many. A day is the unit the rest of the app
-- already thinks in, and "today's entry" is a single thing to return to — a
-- list of six fragments from one afternoon is another pile to manage.

CREATE TABLE public.journal_entries (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date date NOT NULL,
  body text NOT NULL DEFAULT '',
  -- Deliberately not a 1-5 scale. A number invites judging the day and then
  -- comparing it to yesterday's; a word just names where you were. Null is a
  -- first-class answer — plenty of days do not resolve into one of these.
  mood text CHECK (mood IN ('low', 'tender', 'steady', 'good', 'wired')),
  -- Kept separate from the body so it can be prompted for, and so a day with
  -- nothing else in it can still have this.
  gratitude text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX journal_entries_user_id_date_idx
  ON public.journal_entries (user_id, date DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- Same owner-only shape as every other table here. A journal is the most
-- private thing in this app; nothing about it is shared by default, and the
-- share-view function does not read this table at all.
CREATE POLICY "Users can view their own journal entries" ON public.journal_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own journal entries" ON public.journal_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own journal entries" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own journal entries" ON public.journal_entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
