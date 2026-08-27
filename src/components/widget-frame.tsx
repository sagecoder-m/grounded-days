import { useRef, useState, type ReactNode } from "react";
import {
  Columns2,
  Columns3,
  EyeOff,
  LayoutGrid,
  RectangleHorizontal,
  RectangleVertical,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actions, type Settings, type WidgetSize } from "@/lib/store";

/**
 * One Overview widget: its place in the grid, and the menu for changing it.
 *
 * The Overview was a fixed stack of full-width sections — you could reorder it
 * and nothing else. This makes the shape yours too: a widget can take one
 * column, both, or one column and two rows, so area progress can sit beside the
 * fortnight chart if that is how someone reads their own week.
 *
 * A controlled dropdown rather than the Radix context menu, because the menu has
 * to open two ways. Radix's ContextMenu opens on the browser's contextmenu
 * event, which a long press does not reliably produce on iOS — and a long press
 * is the only gesture available on a phone. Driving one controlled menu from both
 * a right-click and a press-and-hold means the two behave identically instead of
 * the touch path being a second-class imitation.
 */

/**
 * Grid placement per size, keyed to the board's width rather than the window's —
 * see the grid in routes/index.tsx for why.
 *
 * The board is six columns so that both halves (three) and thirds (two) divide
 * evenly. Worth knowing what the thresholds cost in window width: the rail and
 * padding take about 344px, so columns start at roughly a 1016px window with the
 * rail open and an 800px one with it collapsed.
 *
 * Thirds wait for a wider board than halves do. The board caps at 960px, so a
 * third is about 300px at best and less than that on a smaller screen — below
 * @3xl a "third" therefore behaves as a half rather than becoming a column too
 * narrow to read. It widens on its own as the window does; nothing needs
 * changing back.
 */
const SPAN: Record<WidgetSize, string> = {
  wide: "@2xl/board:col-span-6",
  square: "@2xl/board:col-span-3",
  third: "@2xl/board:col-span-3 @3xl/board:col-span-2",
  /*
    Half width with a floor under its height.

    Tall used to mean "span three grid rows", which no longer means anything now
    that rows are 1px and a tile's height comes from measuring its own content.
    So it is a minimum instead: the tile is at least this tall and its content
    stretches to fill, which is the same thing visually and survives the change
    to masonry. Two or three ordinary tiles pack alongside it on their own,
    without anything reserving space for them.
  */
  tall: "@2xl/board:col-span-3",
};

/**
 * Extra classes for the measured box rather than the frame.
 *
 * Tall's minimum height has to live here, on the element whose height is being
 * measured. Put on the frame it would fight the row span computed from that
 * measurement — the frame would be forced taller than the rows it was given and
 * would overlap whatever the grid packed underneath.
 *
 * The h-full chain goes with it so the card actually fills the floor rather than
 * leaving a gap inside its own tile.
 */
const INNER: Partial<Record<WidgetSize, string>> = {
  tall: "@2xl/board:min-h-[26rem] [&>*]:h-full [&>*>*]:h-full",
};

const SIZE_OPTIONS: { key: WidgetSize; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "wide", label: "Full width", hint: "Spans the row", icon: RectangleHorizontal },
  { key: "square", label: "Half width", hint: "Two side by side", icon: Columns2 },
  { key: "third", label: "Third width", hint: "Three side by side", icon: Columns3 },
  { key: "tall", label: "Tall", hint: "Half width, taller", icon: RectangleVertical },
];

/** How long a press has to be held before it counts as "hold", in ms. Long
 *  enough not to fire while scrolling, short enough not to feel broken. */
const HOLD_MS = 450;
/** A press that wanders further than this is a scroll, not a hold. */
const HOLD_SLOP_PX = 10;

/**
 * Where a right-click belongs to the browser rather than to us.
 *
 * Only links and text fields. Right-clicking a link should still offer "open in
 * new tab", and a text field should still offer cut/paste — those menus are the
 * ones people actually need, and taking them to offer a resize control is a bad
 * trade. Everywhere else on the tile, including its own buttons and the drag
 * handle, right-click resizes.
 *
 * Buttons used to be exempt here too, which meant right-clicking the drag handle
 * — the one part of a widget that visibly says "this tile can be rearranged", and
 * so the first place anyone would try — did nothing at all.
 */
function isBrowserMenuWanted(target: EventTarget | null) {
  const el = target instanceof Element ? target : null;
  return Boolean(el?.closest("a[href], input, textarea, select, [contenteditable='true']"));
}

/**
 * Controls whose own press gesture must not be hijacked by the hold.
 *
 * Wider than the right-click exemption, because touch has no separate button to
 * press: a hold anywhere is the only way in, so it collides with anything that
 * already responds to being pressed. The drag handle is the case that matters —
 * pressing it started a drag AND a hold at once, and the size menu appeared in
 * the middle of dragging the widget.
 */
function isControl(target: EventTarget | null) {
  const el = target instanceof Element ? target : null;
  return Boolean(
    el?.closest(
      "a[href], input, textarea, select, button, [role='button'], [contenteditable='true']",
    ),
  );
}

/**
 * Make a tile fill the row it was given.
 *
 * Grid gives every item in a row the same height, but the card inside keeps its
 * natural one — so without this an equal-height row just moves the gap from
 * between the tiles to inside them.
 *
 * Three levels, because that is the shape every widget has: the frame's wrapper,
 * the widget's own <section>, and the card as its last child. The card is the
 * part that should grow; the header above it should not.
 */
const FILL =
  // Applied to the wrapper that directly contains the widget's <section>, not to
  // the frame — the frame's own child is this wrapper, so a `> section` selector
  // written there matches nothing and the cards quietly keep their natural
  // height while the tiles around them stretch.
  "flex h-full flex-col [&>section]:flex [&>section]:h-full [&>section]:flex-col " +
  "[&>section>*:last-child]:flex-1";

/**
 * A plain grid cell for content that is not a resizable widget — the pinned
 * greeting. Same column span, none of the menu or the handle.
 */
export function PinnedCell({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={className}>{children}</section>;
}

export function WidgetFrame({
  widgetKey,
  widgets,
  children,
}: {
  widgetKey: string;
  widgets: Settings["widgets"];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Whether the board is currently narrow enough that every size renders the
   * same. The choice is still saved — it applies when there is room — but
   * silently accepting a size and changing nothing is what made resizing feel
   * broken, so the menu says so instead.
   */
  const [singleColumn, setSingleColumn] = useState(false);
  const frameRef = useRef<HTMLElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);

  /** Read the grid itself rather than re-deriving the breakpoint in JS, so this
   *  cannot drift out of step with the CSS above. */
  function openMenu() {
    const grid = frameRef.current?.parentElement;
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 2;
    setSingleColumn(cols < 2);
    setMenuOpen(true);
  }

  const entry = widgets.find((w) => w.key === widgetKey);
  const size = entry?.size ?? "wide";

  function setSize(next: WidgetSize) {
    actions.reorderWidgets(widgets.map((w) => (w.key === widgetKey ? { ...w, size: next } : w)));
    setMenuOpen(false);
  }

  function hide() {
    actions.reorderWidgets(
      widgets.map((w) => (w.key === widgetKey ? { ...w, enabled: false } : w)),
    );
    setMenuOpen(false);
  }

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    holdOrigin.current = null;
  }

  return (
    <section
      ref={frameRef}
      // @container so a widget's own contents lay out against the width it
      // actually has. Without it, half-width widgets keep asking the viewport
      // how much room they have and get the wrong answer.
      className={`@container relative ${SPAN[size]}`}
      onContextMenu={(e) => {
        // The app's own menu instead of the browser's. Right-click is the
        // desktop half of the same gesture the hold covers on touch.
        if (isBrowserMenuWanted(e.target)) return;
        e.preventDefault();
        openMenu();
      }}
      onPointerDown={(e) => {
        // Mouse right-clicks are handled above; only a touch or pen press starts
        // a hold, so a left-click-and-drag on a chart never opens a menu.
        if (e.pointerType === "mouse" || isControl(e.target)) return;
        holdOrigin.current = { x: e.clientX, y: e.clientY };
        holdTimer.current = window.setTimeout(openMenu, HOLD_MS);
      }}
      onPointerMove={(e) => {
        const origin = holdOrigin.current;
        if (!origin) return;
        const moved =
          Math.abs(e.clientX - origin.x) > HOLD_SLOP_PX ||
          Math.abs(e.clientY - origin.y) > HOLD_SLOP_PX;
        if (moved) cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
    >
      <div className={`${FILL} ${INNER[size] ?? ""}`}>{children}</div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Anchored to the widget's top-right rather than the cursor. A menu that
            appears where the widget is makes it obvious which one is being
            changed, which matters when two sit side by side. */}
        {/*
          A visible control, not only a gesture.

          Right-click and long-press still work, but they cannot be the only way
          in. The frame yields the gesture wherever the browser's own menu is
          worth more — links and text fields — and some widgets are mostly text
          fields: the focus timer has six, and every task row carries inline
          editors. On those, right-clicking worked on some pixels and did nothing
          on others, which is not a control, it is a coin toss. Hence a button
          that is always in the same place and always works.

          Left margin under the drag handle rather than inside the widget: the
          two controls that act on a tile rather than its contents belong
          together, outside the tile, and that margin is already proven to have
          room. Always faintly visible for the same reason the handle is — a
          control that appears on hover of the box it sits outside of fades as
          you reach for it.
        */}
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Change widget size"
            title="Widget size"
            className="absolute -left-1 top-8 z-10 grid h-8 w-8 place-items-center rounded-lg text-ink-soft opacity-40 transition-all hover:bg-secondary hover:text-ink hover:opacity-100 focus-visible:opacity-100 md:-left-6 md:w-6"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 bg-card">
          {SIZE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.key}
              onSelect={() => setSize(option.key)}
              className="gap-2.5"
            >
              <option.icon
                className={`h-4 w-4 ${size === option.key ? "text-primary" : "text-ink-soft"}`}
              />
              <span className="flex flex-1 flex-col">
                <span className={size === option.key ? "font-medium" : ""}>{option.label}</span>
                <span className="text-[11px] text-ink-soft">{option.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
          {singleColumn && (
            <p className="px-2 py-1.5 text-[11px] leading-snug text-ink-soft">
              This window is too narrow to place two widgets side by side, so sizes are saved but
              look the same for now.
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={hide} className="gap-2.5">
            <EyeOff className="h-4 w-4 text-ink-soft" />
            <span className="flex flex-1 flex-col">
              <span>Hide</span>
              <span className="text-[11px] text-ink-soft">Bring it back in Profile</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}
