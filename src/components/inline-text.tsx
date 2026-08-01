import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

interface Props {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  as?: "div" | "span";
  showIcon?: boolean;
}

/** Click-to-edit text. Enter saves, Escape cancels. */
export function InlineText({
  value,
  onSave,
  className,
  placeholder = "Add a note…",
  multiline = false,
  showIcon = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Only adopt an incoming value while NOT editing. Writes are async now, so a
  // background refetch can land mid-edit, and without this guard it would wipe
  // whatever the user was typing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onSave(next);
  };

  if (editing) {
    const shared = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
      },
      className: cn(
        "w-full rounded-xl border border-border bg-background px-2 py-1 outline-none focus:border-primary",
        className,
      ),
    };
    return multiline ? (
      <textarea ref={ref as never} rows={2} {...shared} />
    ) : (
      <input ref={ref as never} {...shared} />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={cn(
        "group/inline inline-flex w-full items-start gap-1.5 rounded-xl px-2 py-1 -mx-2 text-left transition-colors hover:bg-secondary/70",
        className,
      )}
    >
      <span className={cn("flex-1 whitespace-pre-wrap break-words", !value && "italic text-ink-soft")}>
        {value || placeholder}
      </span>
      {showIcon && (
        <Pencil className="mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/inline:opacity-60" />
      )}
    </button>
  );
}
