import { forwardRef, type ReactNode } from "react";
import { GripVertical, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The frame around one widget on the board.
 *
 * Deliberately thin. It owns the card, the header and the controls; it owns no
 * layout — where it sits and how big it is come from the engine, which sets a
 * transform and a width/height on the element this forwards its ref to.
 *
 * forwardRef because the engine positions this element directly, and it passes
 * its own style, className and pointer handlers through — dropping any of them
 * would leave the tile unable to be dragged.
 */
export const WidgetShell = forwardRef<
  HTMLDivElement,
  {
    title: string;
    children: ReactNode;
    onRemove?: () => void;
    dragging?: boolean;
    className?: string;
    style?: React.CSSProperties;
  } & React.HTMLAttributes<HTMLDivElement>
>(function WidgetShell(
  { title, children, onRemove, dragging = false, className, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        /*
          @container so the content can lay itself out against the width the
          tile actually has. This is what makes a widget adapt when it is
          resized rather than overflow: its own contents query this box, not
          the window.
        */
        "@container group/widget flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
        // Only the shadow and the ring transition. Never the transform: the
        // engine drives that, and easing it here would put the tile behind the
        // cursor while dragging.
        "transition-[box-shadow,border-color] duration-200 ease-out",
        dragging
          ? "z-30 border-tan shadow-[0_8px_30px_rgb(0_0_0/0.18)]"
          : "shadow-[0_1px_2px_rgb(75_66_55/0.05)] hover:border-tan/70",
        className,
      )}
      {...rest}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-2.5">
        {/* Not the only way to drag — the whole card body works — but the one
            visible sign that a tile can be moved at all. */}
        <GripVertical
          className="h-3.5 w-3.5 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover/widget:opacity-60 pointer-coarse:opacity-40"
          aria-hidden
        />
        <h2 className="min-w-0 flex-1 truncate font-serif text-sm leading-none">{title}</h2>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            title={`Remove ${title}`}
            className="reveal-control shrink-0 rounded p-0.5 text-ink-soft transition-colors hover:text-[color:var(--clay)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      {/*
        min-h-0 is load-bearing. A flex child defaults to min-height:auto and
        refuses to shrink below its content, so without it a tall list would
        push past the bottom of a tile the user had deliberately made short —
        the tile would grow instead of the content adapting, which is the whole
        thing this board is for.
      */}
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">{children}</div>
    </div>
  );
});
