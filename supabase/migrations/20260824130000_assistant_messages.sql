-- Persisted assistant conversation.
--
-- One rolling thread per user rather than named conversations. A thread list is
-- another thing to organise, and the assistant's job here is continuity — "what
-- did we decide yesterday" — not archiving separate projects.
--
-- Note this is a lower privacy bar than the journal but not nothing: what
-- someone asks a planner reveals plenty. Same owner-only RLS, and the AI context
-- builder still never reads journal_entries.

CREATE TABLE public.assistant_messages (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_messages_user_id_created_at_idx
  ON public.assistant_messages (user_id, created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own assistant messages" ON public.assistant_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own assistant messages" ON public.assistant_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Deletion is how "clear the conversation" works, so it stays available.
-- Update is not: an assistant reply that could be edited after the fact is a
-- record of nothing.
CREATE POLICY "Users can delete their own assistant messages" ON public.assistant_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
