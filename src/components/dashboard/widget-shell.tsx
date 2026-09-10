import { forwardRef, type ReactNode } from "react";
import { GripVertical, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DRAG_HANDLE_CLASS } from "./layout-engine";

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
    /** Pinned furniture gets no grip: there is nothing to drag it by. */
    pinned?: boolean;
    dragging?: boolean;
    /**
     * Whether the grip renders at all.
     *
     * The grip used to be faintly visible all the time, which was right when
     * dragging was always live: a control nobody can see is a control nobody
     * finds. Now that dragging only works inside "Edit size", showing the grip
     * outside it would be worse than the old problem — a handle that looks
     * grabbable but does nothing is the exact confusion the always-on version
     * was built to avoid. So it only exists while this is true, matching
     * dashboard-canvas's own isDraggable for the same tile exactly.
     */
    editingSize?: boolean;
    className?: string;
    style?: React.CSSProperties;
  } & React.HTMLAttributes<HTMLDivElement>
>(function WidgetShell(
  {
    title,
    children,
    onRemove,
    pinned = false,
    dragging = false,
    editingSize = false,
    className,
    style,
    ...rest
  },
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
      {!pinned && editingSize && (
        /*
          The grip is the whole drag surface. It sits over the top-left corner
          rather than in a header row, so it costs no height and the widget's
          own heading is still the first thing in the tile — and everything else
          inside stays clickable, which is the point of having a handle at all.
        */
        <span
          className={cn(
            DRAG_HANDLE_CLASS,
            /*
              Faint rather than hidden, for as long as it exists at all. Not
              reveal-control: this is the only thing that moves a widget, and a
              control you cannot see until you happen to hover the right tile is
              a control nobody finds while "Edit size" is actually open. Faint
              enough to stay out of the way, solid on hover so it is obvious
              what you are reaching for.

              reveal-control would also make it pointer-events:none until the
              hover lands, which is a race worth not having on the one element
              every drag has to start from.
            */
            "absolute left-0 top-0 z-10 cursor-grab rounded-full bg-card/80 p-1 text-ink-soft opacity-30 backdrop-blur-sm transition-opacity",
            "hover:opacity-100 group-hover/widget:opacity-70 active:cursor-grabbing",
          )}
          aria-hidden
          title={`Drag to move ${title}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}

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

      {/*
        {children} renders directly here, one level up from where it used to
        sit — and that level matters more than it looks like it should.

        The engine does not pass resize handles to this component as a
        separate prop. It clones whatever element `children` resolves to and
        rewrites that element's OWN children array to be
        [original content, ...handle spans] — see react-resizable's Resizable,
        which is where the array actually gets built. Those handles are meant
        to land as direct children of the grid item, siblings of everything
        else in the tile, because the library's own stylesheet hides them with
        `.react-resizable-hide > .react-resizable-handle { display: none }` —
        a selector that only matches a *direct* child.

        A nested wrapper div here used to sit between them and that class,
        so every handle was two levels down instead of one and the selector
        never matched — meaning display:none never applied, and a "not
        resizable" tile kept fully live, fully draggable resize handles
        sitting on it invisibly. It went unnoticed for as long as every
        widget was resizable all the time, because there was never a
        "should be hidden" case to expose it. There is now: outside "Edit
        size" every movable widget is meant to be locked, and this is the
        difference between actually locked and locked-looking.

        The scroll containment that div used to provide (min-h-0, flex-1,
        overflow-hidden) moves to wrap the widget's own content at the call
        site instead, so the content still gets it — just no longer as the
        thing standing between the handles and the class that hides them.
      */}
      {children}
    </div>
  );
});
