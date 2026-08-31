import { cn } from "@/lib/utils";

/**
 * The clock time something is due, beside the day it is due on.
 *
 * A native `<input type="time">` rather than a bespoke picker, which is the
 * opposite of the choice DateField makes — and for a reason that does not apply
 * here. DateField exists because the native date input hands its *popup* to the
 * browser shell, an unthemeable grid rendered outside the page. The time input
 * has no popup worth the name: it is three small spin fields inline, it inherits
 * this app's font and colours like any other input, and on a phone it opens the
 * OS time wheel, which is genuinely the best control for setting 11:59pm and one
 * nobody could improve on in CSS.
 *
 * The value is 24-hour "HH:mm" in every browser regardless of what it displays,
 * which is exactly what the column stores.
 */
export function TimeField({
  id,
  value,
  onChange,
  clearable = true,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  /** 24-hour "HH:mm", or "" for none. */
  value: string;
  onChange: (next: string) => void;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        id={id}
        type="time"
        value={value}
        aria-label={ariaLabel ?? "Due time"}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-lg border border-border bg-background px-2 py-1 text-[11px] tabular-nums outline-none focus:border-primary",
          className,
        )}
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the time"
          title="Clear the time"
          className="text-[11px] text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          clear
        </button>
      )}
    </span>
  );
}

/** "11:59 PM" from "23:59". Returns null for anything unparseable, so a bad
 *  value renders as nothing rather than as "Invalid Date". */
export function formatTime(value?: string): string | null {
  if (!value) return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours < 12 ? "AM" : "PM";
  // 0 shows as 12, and 13–23 wrap; 12 stays 12, which "% 12" alone would make 0.
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
}
