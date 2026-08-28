-- Keeps assistant_conversations.updated_at true to "when did I last actually
-- say something here" without relying on the client to remember to bump it.
--
-- The conversation list sorts by updated_at, and a client-side update call
-- is one more request that can fail, race with a fast double-send, or just
-- get forgotten the next time this page is touched. The database already
-- knows a message landed; it might as well be the one thing keeping the
-- sort order honest.
--
-- Plain, not SECURITY DEFINER: the person inserting a message already owns
-- the conversation it belongs to (assistant_messages.conversation_id can
-- only reference a conversation whose RLS insert policy they already passed
-- to create), so the existing "Users can rename their own conversations"
-- UPDATE policy already permits this write under their own privileges.
CREATE OR REPLACE FUNCTION public.touch_assistant_conversation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.assistant_conversations
    SET updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assistant_messages_touch_conversation
  AFTER INSERT ON public.assistant_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_assistant_conversation();
