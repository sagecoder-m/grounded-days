import { createFileRoute } from "@tanstack/react-router";
import { track } from "@/lib/telemetry";
import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { GrowingTextarea } from "@/components/growing-textarea";
import { CopyButton } from "@/components/copy-button";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/store";
import { compressImage } from "@/lib/compress-image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineText } from "@/components/inline-text";
import { ConfirmDeleteButton } from "@/components/confirm-delete";
import { useSession } from "@/lib/use-session";
import type { Json } from "@/integrations/supabase/types";

/** Everything ask() needs, which is also everything a retry needs. */
interface PendingAsk {
  next: Message[];
  attachments: Attachment[];
  conversationId: string;
  isFirstMessage: boolean;
  content: string;
}

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

interface Attachment {
  path: string;
}

/** attachments is jsonb, so it arrives as unknown-shaped Json and needs
 *  validating rather than trusted — same reasoning as widgets in mappers.ts. */
function toAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const path = (entry as { path?: unknown } | null)?.path;
    return typeof path === "string" ? [{ path }] : [];
  });
}

/** The reverse direction: a plain Attachment[] widened to what the jsonb
 *  column actually accepts. */
function attachmentsToJson(attachments: Attachment[]): Json {
  return attachments.map((a) => ({ path: a.path })) as Json;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
}

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

/** Openers that produce something useful rather than "how can I help?". */
const STARTERS = [
  "What should I do first today?",
  "Break my next goal into smaller steps",
  "Is my week too full?",
  "I have 30 minutes — what is worth doing?",
  "Add a task to draft my assignment",
];

/** Private bucket, one folder per user — see the migration that created it. */
const BUCKET = "assistant-uploads";
/** Long enough to read on the sidebar list without wrapping to three lines. */
const TITLE_MAX = 48;

function titleFrom(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Photo";
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX)}…` : trimmed;
}

function AssistantPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Signed URLs for attachments already in history — resolved lazily, keyed
  // by storage path, because the bucket is private and a bare path is not
  // something an <img> tag can load.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<{
    path: string;
    previewUrl: string;
    uploading: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** In-flight request, so Stop can cancel it rather than merely ignore it. */
  const abortRef = useRef<AbortController | null>(null);
  /** The last send that failed, kept so "Try again" can repeat it. */
  const [retry, setRetry] = useState<PendingAsk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * The conversation list, loaded once per session rather than kept in React
   * Query — same reasoning as the messages below: this page owns an
   * append-only-ish log, and a background refetch mid-reply would fight the
   * optimistic updates a send does to both lists at once.
   */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("assistant_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (!loadError && data) {
        const list = data.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
        setConversations(list);
        // The most recently used one wins on first load. Never overrides a
        // choice already made — this effect only runs once per session.
        setActiveId((current) => current ?? list[0]?.id ?? null);
      }
      setConversationsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** History for whichever conversation is active. Null means "no conversation
   *  chosen yet" — the welcome state, not an empty chat. */
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("assistant_messages")
        .select("id, role, content, attachments")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (!loadError && data) {
        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as Message["role"],
            content: m.content,
            attachments: toAttachments(m.attachments),
          })),
        );
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  /** Resolves a signed URL for every attachment path this session has not
   *  already resolved. Runs after messages load rather than at send time, so
   *  a photo sent earlier this session and one loaded from history both end
   *  up rendered the same way. */
  useEffect(() => {
    const unresolved = [
      ...new Set(messages.flatMap((m) => m.attachments.map((a) => a.path))),
    ].filter((path) => !(path in imageUrls));
    if (unresolved.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        unresolved.map(async (path) => {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
          return [path, data?.signedUrl ?? null] as const;
        }),
      );
      if (cancelled) return;
      setImageUrls((prev) => {
        const next = { ...prev };
        for (const [path, url] of entries) if (url) next[path] = url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Only re-runs when the message set changes shape; imageUrls itself is
    // an output of this effect, not something it should react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /*
    Follow the conversation, but only if they are already at the bottom of it.

    This used to scroll on every change unconditionally, which meant scrolling
    up to re-read an earlier answer while a reply was arriving yanked the page
    back down — the one moment the app takes the page away from you. Chat UIs
    stick to the bottom while you are at the bottom and leave you alone
    otherwise, and that is the whole rule.
  */
  useEffect(() => {
    const fromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    // A generous threshold: "near the bottom" should survive a reply landing
    // between the check and the scroll, and the composer sitting below the list.
    if (fromBottom > 220) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  /** Fire-and-forget: a failed history write must not lose the reply on screen. */
  function persist(
    role: Message["role"],
    content: string,
    conversationId: string,
    attachments: Attachment[] = [],
  ) {
    if (!user) return;
    void supabase
      .from("assistant_messages")
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        role,
        content,
        attachments: attachmentsToJson(attachments),
      })
      .then(({ error: writeError }) => {
        if (writeError) console.error("could not save message", writeError.message);
      });
  }

  /** Creates a conversation the first time something is actually sent into
   *  it. Clicking "New chat" alone does not create a row — an empty shell
   *  nobody ever wrote into would just be clutter in the list next time. */
  async function ensureConversation(): Promise<string | null> {
    if (activeId) return activeId;
    if (!user) return null;
    const { data, error: createError } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: user.id })
      .select("id, title, updated_at")
      .single();
    if (createError || !data) {
      toast.error("Could not start a new chat", { description: createError?.message });
      return null;
    }
    const created: Conversation = { id: data.id, title: data.title, updatedAt: data.updated_at };
    setConversations((prev) => [created, ...prev]);
    setActiveId(created.id);
    return created.id;
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setDraft("");
    clearPendingImage();
    setError(null);
  }

  async function renameConversation(id: string, title: string) {
    const clean = title.trim() || null;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    const { error: renameError } = await supabase
      .from("assistant_conversations")
      .update({ title: clean })
      .eq("id", id);
    if (renameError)
      toast.error("Could not rename that chat", { description: renameError.message });
  }

  async function deleteConversation(id: string) {
    const previous = conversations;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
    const { error: delError } = await supabase
      .from("assistant_conversations")
      .delete()
      .eq("id", id);
    if (delError) {
      setConversations(previous);
      if (activeId === id) setActiveId(id);
      toast.error("Could not delete that chat", { description: delError.message });
    }
  }

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  async function pickImage(file: File) {
    if (!user) return;
    clearPendingImage();
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ path: "", previewUrl, uploading: true });
    try {
      const blob = await compressImage(file);
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (uploadError) throw uploadError;
      setPendingImage({ path, previewUrl, uploading: false });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setPendingImage(null);
      toast.error("Could not attach that image", { description: (err as Error).message });
    }
  }

  async function send(text: string) {
    const content = text.trim();
    const image = pendingImage;
    if ((!content && !image) || busy) return;
    // Still uploading — the send button is disabled for this too, but a fast
    // Enter keypress can race it.
    if (image?.uploading) return;

    const conversationId = await ensureConversation();
    if (!conversationId) return;

    const attachments: Attachment[] = image ? [{ path: image.path }] : [];
    const isFirstMessage = messages.length === 0;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content, attachments };
    const next = [...messages, userMessage];
    setMessages(next);
    persist("user", content, conversationId, attachments);
    setDraft("");
    clearPendingImage();

    await ask({ next, attachments, conversationId, isFirstMessage, content });
  }

  /** Cancel the reply in flight. Leaves the question in the conversation —
   *  they asked it, and a retry should not have to retype it. */
  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  /**
   * The half of a send that talks to the network, kept separate so "Try
   * again" can run it a second time without adding the message to the
   * conversation twice.
   */
  async function ask({ next, attachments, conversationId, isFirstMessage, content }: PendingAsk) {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setBusy(true);

    try {
      track("assistant_message");
      setRetry(null);
      const { data, error: fnError } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          attachments: attachments.map((a) => a.path),
        },
        // What makes Stop actually stop, rather than hide a reply that is
        // still being paid for and still on its way.
        signal: controller.signal,
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
        setRetry({ next, attachments, conversationId, isFirstMessage, content });
        return;
      }
      if (!data?.content) {
        setError("The assistant had nothing to say. Try rephrasing?");
        setRetry({ next, attachments, conversationId, isFirstMessage, content });
        return;
      }
      setMessages([
        ...next,
        { id: crypto.randomUUID(), role: "assistant", content: data.content, attachments: [] },
      ]);
      persist("assistant", data.content, conversationId);

      if (isFirstMessage) {
        const title = titleFrom(content);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
        );
        void supabase
          .from("assistant_conversations")
          .update({ title })
          .eq("id", conversationId)
          .then(({ error: titleError }) => {
            if (titleError) console.error("could not save conversation title", titleError.message);
          });
      }

      // The assistant can create tasks now, and those rows are written by the
      // edge function — outside React Query's knowledge. Without this the task
      // exists in the database but the list on every other page keeps showing
      // the stale cache until a reload, which reads exactly like the write
      // silently failing.
      const created = Array.isArray(data.createdTasks) ? data.createdTasks : [];
      if (created.length > 0 && user) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user.id) });
        toast.success(created.length === 1 ? "Task added" : `${created.length} tasks added`, {
          description: created.map((t: { title: string }) => t.title).join(", "),
        });
      }
    } catch {
      /*
        An abort lands here too, and it is not a failure: the person pressed
        Stop, so telling them the connection might be down would be inventing a
        problem they just created on purpose.
      */
      if (controller.signal.aborted) return;
      setError("Could not reach the assistant. Check your connection.");
      setRetry({ next, attachments, conversationId, isFirstMessage, content });
    } finally {
      setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="chip bg-secondary text-ink-soft">Assistant</p>
          <h1 className="mt-3 font-serif text-2xl md:text-3xl">Think it through with me</h1>
          <p className="mt-2 max-w-lg text-ink-soft">
            It can see your goals, tasks, projects, habits and schedule, and it can add tasks for
            you from what you type or a photo you send. It cannot see your journal.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChatSwitcher
            conversations={conversations}
            loaded={conversationsLoaded}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={startNewChat}
          />
          {active && (
            <InlineText
              value={active.title ?? ""}
              onSave={(v) => renameConversation(active.id, v)}
              placeholder="Name this chat"
              showIcon
              className="min-w-0 truncate font-serif text-lg"
            />
          )}
        </div>
        {active && (
          <ConfirmDeleteButton
            itemLabel={active.title ?? "this chat"}
            consequence="Every message in it goes with it. This cannot be undone."
            onConfirm={() => deleteConversation(active.id)}
            className="reveal-control grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-soft hover:text-[color:var(--clay)] md:opacity-40 md:hover:opacity-100"
            iconClassName="h-3.5 w-3.5"
            aria-label="Delete this chat"
          />
        )}
      </div>

      {loaded && !activeId && (
        <div className="space-y-3">
          <div className="card-soft flex items-start gap-3 p-5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-ink-soft">
              Ask for the next small step rather than a whole plan, or send a photo of a syllabus or
              schedule — that is what it is best at.
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
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "card-soft whitespace-pre-wrap"
              }`}
            >
              {m.attachments.map((a) =>
                imageUrls[a.path] ? (
                  <img
                    key={a.path}
                    src={imageUrls[a.path]}
                    alt="Attached"
                    className="mb-2 max-h-64 rounded-xl object-contain"
                  />
                ) : (
                  <div
                    key={a.path}
                    className="mb-2 h-32 w-full animate-pulse rounded-xl bg-black/10"
                  />
                ),
              )}
              {m.content}
              {/* Replies only. There is nothing to copy from your own message
                  that you did not just write. */}
              {m.role === "assistant" && m.content && (
                <div className="-mb-1 mt-2 flex justify-end">
                  <CopyButton text={m.content} />
                </div>
              )}
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
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-tan bg-secondary/60 px-4 py-3 text-sm text-ink-soft">
          <span className="min-w-0 flex-1">{error}</span>
          {/* The question is still in the conversation above, so the only thing
              a failure should cost is one tap — not retyping what they wrote. */}
          {retry && !busy && (
            <button
              type="button"
              onClick={() => void ask(retry)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-tan px-3 py-1 text-xs text-ink transition-colors hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          )}
        </div>
      )}

      {pendingImage && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-2">
          <img
            src={pendingImage.previewUrl}
            alt="Selected"
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <span className="flex-1 text-xs text-ink-soft">
            {pendingImage.uploading ? "Uploading…" : "Attached — sent with your next message"}
          </span>
          <button
            type="button"
            onClick={clearPendingImage}
            aria-label="Remove image"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pickImage(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0 rounded-full border-tan"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Attach an image"
          title="Attach a photo — a syllabus, a schedule, a handwritten list"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <GrowingTextarea
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
          placeholder="Ask about your week, or attach a photo…"
          className="min-h-12 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />
        {busy ? (
          /*
            Stop, in the send button's place rather than beside it.

            A reply you no longer want — a misread question, a wrong course — is
            otherwise something you can only wait out, and waiting out an answer
            you already know is wrong is the most frustrating state a chat has.
            It replaces Send because there is nothing to send while one is in
            flight, and two buttons where one is always dead is worse.
          */
          <Button
            type="button"
            variant="outline"
            onClick={stop}
            className="h-12 shrink-0 rounded-full border-tan px-4"
            aria-label="Stop"
            title="Stop generating"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={(!draft.trim() && !pendingImage) || pendingImage?.uploading}
            className="h-12 shrink-0 rounded-full px-4"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>

      <p className="text-[11px] italic text-ink-soft">
        Saved to your account, so it is here when you come back. Start a new chat any time — each
        one keeps its own history.
      </p>
    </div>
  );
}

/**
 * The chat picker: current chat's name lives beside this, in the page header
 * — this is only ever the list and "start a new one".
 *
 * One dropdown rather than a persistent sidebar column. A sidebar earns its
 * keep on a page built to show both at once; here it would mean either a
 * narrow rail that adds a breakpoint to get right, or a full column stacked
 * above the conversation on a phone, pushing the thing someone actually
 * opened the page for below a list of other things they didn't. A menu next
 * to the title works the same way at every width.
 */
function ChatSwitcher({
  conversations,
  loaded,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: Conversation[];
  loaded: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-full border-tan">
          <MessagesSquare className="h-3.5 w-3.5" />
          Chats
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-card">
        <DropdownMenuItem
          onSelect={() => {
            onNew();
            setOpen(false);
          }}
          className="gap-2"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </DropdownMenuItem>
        {conversations.length > 0 && <DropdownMenuSeparator />}
        {!loaded && <p className="px-2 py-1.5 text-xs italic text-ink-soft">Loading…</p>}
        {loaded && conversations.length === 0 && (
          <p className="px-2 py-1.5 text-xs italic text-ink-soft">No chats yet.</p>
        )}
        {conversations.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => {
              onSelect(c.id);
              setOpen(false);
            }}
            className={c.id === activeId ? "bg-secondary" : undefined}
          >
            <span className="min-w-0 flex-1 truncate">{c.title ?? "New chat"}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
