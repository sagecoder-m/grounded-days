import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A date field that actually looks like the rest of grounded.
 *
 * `<input type="date">` hands the popup calendar to the OS or browser shell —
 * Chrome's blue-and-white grid, unthemeable by any CSS this app could write,
 * because that popup renders outside the page entirely. This is the fix:
 * react-day-picker's Calendar was already sitting in the codebase (installed,
 * never wired to anything), and it draws with the app's own CSS variables —
 * bg-primary, bg-accent — the same tokens every button and chip already use,
 * so it inherits the sage-and-cream palette for free rather than needing its
 * own theme.
 *
 * The trigger stays a plain button showing the formatted date, so the value
 * reads the way the rest of the app writes a date (this whole codebase uses
 * "MMM d, yyyy" — see niceDate in task-row.tsx) rather than the native
 * input's locale-dependent, resizing-with-the-year mm/dd/yyyy.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  placeholder = "Pick a date",
  clearable = false,
  className,
  align = "start",
  "aria-label": ariaLabel,
  icon = true,
  label,
}: {
  id?: string;
  /** ISO yyyy-MM-dd, or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  /** Also ISO yyyy-MM-dd — days before this are disabled. */
  min?: string;
  placeholder?: string;
  /** Shows a "Clear" action beneath the grid, for a field like a goal's
   *  target date where no date is a real, valid choice. */
  clearable?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  "aria-label"?: string;
  /** Hides the leading calendar glyph, for a trigger that already sits next
   *  to its own icon or reads fine as bare text. */
  icon?: boolean;
  /**
   * Overrides the trigger's text. Some call sites say more than a date can —
   * "today", "gently overdue · Aug 25" — and that phrasing belongs to the
   * caller, not to a shared component's one formatting rule.
   */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const minDate = min ? parseISO(min) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm outline-none transition-colors focus:border-primary",
            !value && "text-ink-soft",
            className,
          )}
        >
          {icon && <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">
            {label ?? (selected ? format(selected, "MMM d, yyyy") : placeholder)}
          </span>
        </button>
      </PopoverTrigger>
      {/* Frosting now comes from PopoverContent itself, so this only has to
          say it is grid-sized rather than the default 18rem column. */}
      <PopoverContent align={align} className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
          disabled={minDate ? { before: minDate } : undefined}
          className="bg-transparent p-0"
        />
        {clearable && value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
