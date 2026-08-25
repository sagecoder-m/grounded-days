import { createFileRoute } from "@tanstack/react-router";
import { track } from "@/lib/telemetry";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/use-session";

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
  "Add a task to draft my assignment",
];

function AssistantPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // History is loaded once rather than kept in React Query: this is an
  // append-only log the page itself owns, and a background refetch mid-reply
  // would fight the optimistic append.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("assistant_messages")
        .select("role, content")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (!loadError && data) {
        setMessages(data.map((m) => ({ role: m.role as Message["role"], content: m.content })));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  /** Fire-and-forget: a failed history write must not lose the reply on screen. */
  function persist(role: Message["role"], content: string) {
    if (!user) return;
    void supabase
      .from("assistant_messages")
      .insert({ user_id: user.id, role, content })
      .then(({ error: writeError }) => {
        if (writeError) console.error("could not save message", writeError.message);
      });
  }

  async function clearHistory() {
    if (!user) return;
    const previous = messages;
    setMessages([]);
    const { error: delError } = await supabase
      .from("assistant_messages")
      .delete()
      .eq("user_id", user.id);
    if (delError) {
      setMessages(previous);
      toast.error("Could not clear that", { description: delError.message });
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    persist("user", content);
    setDraft("");
    setError(null);
    setBusy(true);

    try {
      track("assistant_message");
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
      persist("assistant", data.content);

      // The assistant can create tasks now, and those rows are written by the
      // edge function — outside React Query's knowledge. Without this the task
      // exists in the database but the list on every other page keeps showing
      // the stale cache until a reload, which reads exactly like the write
      // silently failing.
      const created = Array.isArray(data.createdTasks) ? data.createdTasks : [];
      if (created.length > 0 && user) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user.id) });
        toast.success(
          created.length === 1 ? "Task added" : `${created.length} tasks added`,
          { description: created.map((t: { title: string }) => t.title).join(", ") },
        );
      }
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
          It can see your goals, tasks, projects, habits and schedule, and it can add tasks for
          you. It cannot see your journal.
        </p>
      </header>

      {messages.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void clearHistory()}
            className="gap-1.5 rounded-full text-xs text-ink-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear conversation
          </Button>
        </div>
      )}

      {loaded && messages.length === 0 && (
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
        Saved to your account, so it is here when you come back. Clear it any time.
      </p>
    </div>
  );
}
