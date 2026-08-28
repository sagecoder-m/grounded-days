-- Separate, named conversations for the assistant, and room for an image on
-- a message.
--
-- The original design here was deliberate — see 20260824130000_assistant_
-- messages.sql's own comment: "a thread list is another thing to organise,
-- and the assistant's job here is continuity, not archiving separate
-- projects." That held while the assistant was one running exchange. It
-- stops holding once a photo of a syllabus is a normal way to start a
-- conversation: syllabus photo in September and "what should I do today" on
-- a Tuesday are not turns in the same thread, and forcing them into one
-- rolling log makes the second one scroll past the first every time. Named,
-- switchable conversations are the fix, and the person is still the one
-- deciding when a new one starts — nothing here infers a topic change on
-- its own.

CREATE TABLE public.assistant_conversations (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Null until the first message names it. A conversation with nothing said
  -- yet has nothing to summarise into a title.
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Bumped on every message, not just on rename, so the list sorts by "what
  -- did I last actually say" rather than by when the empty shell was made.
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_conversations_user_id_updated_at_idx
  ON public.assistant_conversations (user_id, updated_at DESC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations" ON public.assistant_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own conversations" ON public.assistant_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can rename their own conversations" ON public.assistant_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations" ON public.assistant_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Every existing message needs a home before conversation_id can be required,
-- so it arrives nullable, gets backfilled, then locked down. One conversation
-- per person who has ever used the assistant, titled from the first thing
-- they actually said — better than "Conversation 1" for a list someone opens
-- for the first time.
ALTER TABLE public.assistant_messages ADD COLUMN conversation_id uuid
  REFERENCES public.assistant_conversations (id) ON DELETE CASCADE;

-- A photo, if the message carried one: [{ "path": "<user_id>/<uuid>.jpg" }].
-- The path only — never the image itself. See the assistant-uploads bucket
-- migration for why it lives in storage instead of this table.
ALTER TABLE public.assistant_messages ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
  legacy_user record;
  new_conversation_id uuid;
  first_line text;
BEGIN
  FOR legacy_user IN
    SELECT DISTINCT user_id FROM public.assistant_messages WHERE conversation_id IS NULL
  LOOP
    SELECT left(content, 60) INTO first_line
      FROM public.assistant_messages
      WHERE user_id = legacy_user.user_id AND role = 'user'
      ORDER BY created_at ASC
      LIMIT 1;

    INSERT INTO public.assistant_conversations (user_id, title, created_at, updated_at)
    VALUES (
      legacy_user.user_id,
      first_line,
      (SELECT min(created_at) FROM public.assistant_messages WHERE user_id = legacy_user.user_id),
      (SELECT max(created_at) FROM public.assistant_messages WHERE user_id = legacy_user.user_id)
    )
    RETURNING id INTO new_conversation_id;

    UPDATE public.assistant_messages
      SET conversation_id = new_conversation_id
      WHERE user_id = legacy_user.user_id AND conversation_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.assistant_messages ALTER COLUMN conversation_id SET NOT NULL;

-- Replaces the old (user_id, created_at) index: every real query now scopes
-- to one conversation first.
DROP INDEX IF EXISTS public.assistant_messages_user_id_created_at_idx;
CREATE INDEX assistant_messages_conversation_id_created_at_idx
  ON public.assistant_messages (conversation_id, created_at);

-- Deleting a conversation takes its messages with it via the FK's own
-- ON DELETE CASCADE above. The existing per-message DELETE policy on
-- assistant_messages is untouched and still backs "clear this conversation"
-- (delete every message in it, keep the conversation itself) — the UI never
-- offers deleting a single message.
