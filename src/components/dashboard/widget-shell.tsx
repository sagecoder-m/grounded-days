import { forwardRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The frame around one widget on the board.
 *
 * Deliberately invisible. It owns where the tile is and how big it is; it owns
 * nothing about how the widget looks — every widget already brings its own
 * heading and its own surface, and some of them deliberately have no card at
 * all (see the note at the top of today-glance.tsx about a panel of rows
 * reading as a container of things rather than as the things themselves).
 *
 * It had a card, a border and a title bar for a while. That made every widget
 * look the same as every other one and put a second heading above the one the
 * widget had already drawn, so the board stopped looking like grounded and
 * started looking like a generic dashboard. The frame is now chrome-free: the
 * only thing it adds is the remove control, floated over the corner where it
 * takes no layout space.
 *
 * forwardRef because the engine positions this element directly, and it passes
 * its own style, className and pointer handlers through — dropping any of them
 * would leave the tile unable to be dragged.
 */
export const WidgetShell = forwardRef<
  HTMLDivElement,
  {
    /** Only for the remove button's label — nothing is drawn from it. */
    title: string;
    children: ReactNode;
    /** Omitted for a pinned widget, which has nothing to remove it with. */
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
          @container so the content lays itself out against the width the tile
          actually has. This is what lets a widget adapt when it is resized
          rather than overflow: its contents query this box, not the window.
        */
        "@container group/widget relative",
        /*
          min-h-0 and the overflow are load-bearing together. Content taller
          than the tile would otherwise push past the bottom and overlap
          whatever sits below it, because a tile's height is now the user's
          choice rather than the content's.
        */
        "flex min-h-0 flex-col overflow-hidden",
        // Only opacity transitions. Never the transform: the engine drives
        // that, and easing it here would put the tile behind the cursor.
        "transition-opacity duration-200 ease-out",
        // A tile being dragged lifts by going slightly translucent rather than
        // by growing a shadow — there is no card here to cast one.
        dragging && "opacity-90",
        className,
      )}
      {...rest}
    >
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          title={`Remove ${title}`}
          /*
            Floated rather than in a header row, so it costs no height and the
            widget's own heading stays the first thing in the tile. z-10 keeps
            it above content that reaches the corner.
          */
          className="reveal-control absolute right-0 top-0 z-10 rounded-full bg-card/80 p-1 text-ink-soft backdrop-blur-sm transition-colors hover:text-[color:var(--clay)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
});
