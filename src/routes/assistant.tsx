import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** Openers that produce something useful rather than "how can I help?". */
const STARTERS = [
  "What should I do first today?",
  "Break my next goal into smaller steps",
  "Is my week too full?",
  "I have 30 minutes — what is worth doing?",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-chat", {
        body: { messages: next },
      });
      if (fnError) {
        // The function returns a readable message in its body; the SDK's own
        // error text is just the status, which tells the user nothing.
        let message = "Something went wrong reaching the assistant.";
        try {
          const parsed = JSON.parse((await fnError.context?.text?.()) ?? "{}");
          if (parsed.message) message = parsed.message;
        } catch {
          /* keep the fallback */
        }
        setError(message);
        return;
      }
      if (!data?.content) {
        setError("The assistant had nothing to say. Try rephrasing?");
        return;
      }
      setMessages([...next, { role: "assistant", content: data.content }]);
    } catch {
      setError("Could not reach the assistant. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="chip bg-secondary text-ink-soft">Assistant</p>
        <h1 className="mt-3 font-serif text-4xl">Think it through with me</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          It can see your goals, tasks, projects, habits and schedule. It cannot see your journal.
        </p>
      </header>

      {messages.length === 0 && (
        <div className="space-y-3">
          <div className="card-soft flex items-start gap-3 p-5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-ink-soft">
              Ask for the next small step rather than a whole plan — that is what it is best at.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                disabled={busy}
                className="chip bg-secondary text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "card-soft whitespace-pre-wrap"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="card-soft max-w-[85%] px-4 py-3 text-sm italic text-ink-soft">
              Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-dashed border-tan bg-secondary/60 px-4 py-3 text-sm text-ink-soft">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, shift+enter makes a new line — the convention for
            // anything chat-shaped.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          placeholder="Ask about your week…"
          className="flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <Button
          type="submit"
          disabled={busy || !draft.trim()}
          className="h-12 shrink-0 rounded-full px-4"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <p className="text-[11px] italic text-ink-soft">
        Conversations are not saved — this clears when you leave the page.
      </p>
    </div>
  );
}
