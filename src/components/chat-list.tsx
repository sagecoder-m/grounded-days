import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { ConfirmDeleteButton } from "@/components/confirm-delete";

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
  onDelete,
  loaded,
}: {
  conversations: ChatListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
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
          const name = chat.title?.trim() || "New chat";
          return (
            /*
              A row, not a button, because the delete control lives inside it —
              a button nested in a button is invalid markup and the inner one
              stops being reachable by keyboard. So the row is a container and
              the two controls are siblings.
            */
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-1 rounded-xl transition-colors",
                active ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(chat.id)}
                aria-current={active ? "true" : undefined}
                className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left"
              >
                {/* One line, truncated. A wrapped title turns a scannable list
                    into a column of paragraphs, and the date below already tells
                    you which of two similar chats you are looking at. */}
                <span
                  className={cn("block truncate text-sm", active ? "text-ink" : "text-ink-soft")}
                >
                  {name}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-soft">
                  {when(chat.updatedAt)}
                </span>
              </button>

              {/*
                Delete, revealed on hover.

                Hidden until the pointer is on the row on purpose: this list is
                scanned, and a permanently visible bin on every row is one the
                cursor passes over dozens of times a day. The rail is md-and-up
                only, so hover genuinely exists here — on a phone this control
                would be unreachable, which is why the phone keeps the dropdown
                and its own delete in the header.

                It still asks before it acts. Reveal-on-hover reduces how often
                the control is *reached*, not how bad it is to hit by mistake,
                and a chat cannot be recovered.
              */}
              <ConfirmDeleteButton
                itemLabel={name}
                consequence="Every message in it goes with it. This cannot be undone."
                onConfirm={() => onDelete(chat.id)}
                aria-label={`Delete ${name}`}
                className="reveal-control mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-soft hover:text-[color:var(--clay)]"
                iconClassName="h-3 w-3"
              />
            </div>
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
