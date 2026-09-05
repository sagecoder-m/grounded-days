import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ChatListItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

/**
 * Past conversations, down the side.
 *
 * They were behind a "Chats" dropdown, which is the right control when a list
 * is a place you occasionally go and the wrong one when it is context. An
 * assistant's history is context: what you asked last week is usually what you
 * want to pick up, and a menu hides that behind a click and a scan — so in
 * practice people start a new chat instead, and the thread they wanted is
 * quietly abandoned rather than continued.
 *
 * Wide screens only. On a phone a permanent rail would take a third of the
 * width from the conversation itself, which is the one thing that has to be
 * readable; the dropdown stays there and remains the better control at that
 * size, for the same reason the nav does not put a sidebar on a phone.
 */
export function ChatList({
  conversations,
  activeId,
  onSelect,
  onNew,
  loaded,
}: {
  conversations: ChatListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loaded: boolean;
}) {
  return (
    <aside
      aria-label="Your chats"
      /*
        Sticky, and its own scroll. A long history should not push the composer
        off the bottom of the page, and the rail should still be there when you
        have scrolled down a long answer.
      */
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] flex-col md:flex"
    >
      <button
        type="button"
        onClick={onNew}
        className="mb-3 flex shrink-0 items-center gap-2 rounded-2xl border border-tan px-3 py-2 text-sm transition-colors hover:bg-secondary"
      >
        <Plus className="h-3.5 w-3.5" />
        New chat
      </button>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {!loaded && <p className="px-3 py-2 text-xs italic text-ink-soft">Loading…</p>}

        {loaded && conversations.length === 0 && (
          <p className="px-3 py-2 text-xs italic text-ink-soft">
            Nothing here yet. Ask something and it will keep the thread.
          </p>
        )}

        {conversations.map((chat) => {
          const active = chat.id === activeId;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-left transition-colors",
                active ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              {/* One line, truncated. A wrapped title turns a scannable list
                  into a column of paragraphs, and the date below already tells
                  you which of two similar chats you are looking at. */}
              <span className={cn("block truncate text-sm", active ? "text-ink" : "text-ink-soft")}>
                {chat.title?.trim() || "New chat"}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-soft">{when(chat.updatedAt)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/** "Today", "Yesterday", then the date. Nobody needs a clock time on a chat
 *  from three weeks ago, and "23 Aug" is shorter to read than "23/08/2026". */
function when(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday";
    return format(d, "d MMM");
  } catch {
    return "";
  }
}
