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
 * The board is twelve columns, so halves (six), thirds (four) and three
 * quarters (nine) all divide evenly. It was six until three-quarter width was
 * asked for, which six cannot express — 75% of six is four and a half.
 *
 * Worth knowing what the thresholds cost in window width: the rail and padding
 * take about 344px, so columns start at roughly a 1016px window with the rail
 * open and an 800px one with it collapsed.
 *
 * Thirds wait for a wider board than halves do. The board caps at 960px, so a
 * third is about 300px at best and less than that on a smaller screen — below
 * @3xl a "third" therefore behaves as a half rather than becoming a column too
 * narrow to read. It widens on its own as the window does; nothing needs
 * changing back.
 */
const SPAN: Record<WidgetSize, string> = {
  long: "@2xl/board:col-span-12",
  half: "@2xl/board:col-span-6",
  /*
    A third of the row, and one unit tall — the unit every other shape is
    measured in. Below @3xl a third is under 300px, which is narrower than the
    content wants, so it widens to a half; two across still line up.
  */
  square: "@2xl/board:col-span-6 @3xl/board:col-span-4",
  /*
    A third wide and two units tall, so a tall tile is exactly two squares
    stacked — including the gap between them, since spanning two rows absorbs
    the row-gap that would have sat in the middle. That is what keeps a row of
    squares level with the top and bottom of a tall beside them.
  */
  tall: "@2xl/board:col-span-6 @2xl/board:row-span-2 @3xl/board:col-span-4",
};

/** Every tile fills the height its row was given, so a row reads as one band
 *  rather than as tiles of assorted heights sharing a baseline. */
const INNER = "h-full [&>*]:h-full [&>*>*]:h-full";

const SIZE_OPTIONS: { key: WidgetSize; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "long", label: "Long", hint: "Spans the row", icon: RectangleHorizontal },
  { key: "half", label: "Half", hint: "Two side by side", icon: Columns2 },
  { key: "square", label: "Square", hint: "Three side by side", icon: Columns3 },
  { key: "tall", label: "Tall", hint: "A square, twice the height", icon: RectangleVertical },
];

/**
 * Which shapes each widget is allowed to take, by what it contains.
 *
 * A size is not a neutral container — content has a shape it works in, and
 * offering a shape it does not work in is offering a way to break the board.
 * The brief sets this by content type rather than per widget:
 *
 *   LIST    long, half, tall. The only content that may be tall, because it is
 *           the only content where more height means more of the thing you came
 *           for — another few rows of the day. Not square: a square list shows
 *           three items and a scrollbar, which is worse than no list.
 *   CHART   long, half, square. Never tall: a chart's x axis is time, and time
 *           needs length, so height added to a narrow chart is empty space
 *           above the plot rather than more chart.
 *   TIMER   half, square. A dial and two fields — nothing a full row can use
 *           and nothing that rewards height.
 *
 * The order here is the order the menu shows, and the first entry is what a
 * widget falls back to when the size an account stored is not one of its
 * options — so each list leads with the shape that suits it best.
 */
const LIST: WidgetSize[] = ["long", "half", "tall"];
const CHART: WidgetSize[] = ["long", "half", "square"];
const TIMER: WidgetSize[] = ["half", "square"];

const ALLOWED_SIZES: Record<string, WidgetSize[]> = {
  day: LIST,
  upcoming: LIST,
  river: CHART,
  chart: CHART,
  rhythm: CHART,
  balance: CHART,
  movement: CHART,
  goals: CHART,
  focus: TIMER,
};

function sizeOptionsFor(widgetKey: string) {
  const allowed = ALLOWED_SIZES[widgetKey];
  if (!allowed) return SIZE_OPTIONS;
  // Mapped over `allowed`, not filtered from SIZE_OPTIONS, so the preference
  // order above is the order shown and the fallback is the first of them.
  return allowed
    .map((key) => SIZE_OPTIONS.find((o) => o.key === key))
    .filter((o): o is (typeof SIZE_OPTIONS)[number] => Boolean(o));
}

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
 * A plain grid cell, for content that is not a resizable widget — the pinned
 * greeting. Same placement, none of the menu.
 *
 * This used to measure itself and span that many 1px rows, which is how the
 * board packed like masonry: every tile exactly as tall as its own contents,
 * column ends left ragged. The brief asks for the opposite — "everything
 * should always fit to scale, ALWAYS ALIGNED" — so rows are rows again, a row
 * is as tall as the tallest tile in it, and the shorter ones stretch to match.
 * The ResizeObserver, the reflow context and the 1px row trick all went with
 * it; the grid works out heights on its own now.
 */
export function BoardCell({
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
  /*
    A stored size the widget is no longer allowed to take falls back to the
    first shape it is. Accounts were arranged before these rules existed, so
    without this a chart could still be sitting in a shape the menu will not
    offer — rendered one way and described another.
  */
  const options = sizeOptionsFor(widgetKey);
  const stored = entry?.size ?? "long";
  const size = options.some((o) => o.key === stored) ? stored : options[0].key;

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
      <div className={INNER}>{children}</div>

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
          {options.map((option) => (
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
