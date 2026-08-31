/**
 * What each widget is called, how big it wants to be, and how small it may get.
 *
 * One place, so adding a widget type is one entry here plus a case in the
 * canvas's renderer — rather than a label map in Profile, a size rule in the
 * frame and a default somewhere in the mappers, which is how this was spread
 * out before.
 *
 * Sizes are grid units on a BOARD_COLS-wide board: 12 is a third, 18 a half,
 * 36 the full width. Heights are ROW_HEIGHT tall plus the vertical margin, so
 * h:18 is about 590px.
 */
export interface WidgetSpec {
  key: string;
  /**
   * Furniture, not a widget. Always on the board, always where it is, with no
   * drag, no resize, no remove and no switch in Profile.
   *
   * The greeting is the page's header — the date and "Good afternoon, Elia". It
   * is the thing that tells you where you are, and a header that can be moved
   * into the middle of the board, resized to a sliver or switched off is a
   * header that can be lost.
   */
  pinned?: boolean;
  /** What it is called in the Add menu and the Profile list. */
  label: string;
  /** One line, for the Add menu. */
  hint: string;
  /** Where it goes and how big it is when first placed. */
  preferred: { w: number; h: number };
  /** Smallest it may be dragged down to. Overrides the board default when the
   *  content genuinely cannot survive the usual minimum. */
  min?: { w: number; h: number };
  /**
   * Where this sits in the single column a phone gets. Lower comes first.
   *
   * A board has no reading order — things sit side by side and the eye picks.
   * Stacked into one column an order is forced on it, and the saved x/y gave
   * the wrong one: on the default arrangement a phone met two analysis charts
   * before it reached today's list, because those charts happen to sit to the
   * left of it on a wide screen.
   *
   * So the phone orders by what the thing is for. Today and what is coming
   * first, then the tools, then the charts — action before reflection, which is
   * the order the day is actually lived in.
   */
  mobileRank: number;
  /**
   * Whether this widget trims its own contents when it runs out of room.
   *
   * Only the lists do, via FitRows, which shows what fits and says how many it
   * left out. That distinction decides whether a phone may cap its height: a
   * capped list says "+6 more", and a capped chart is just a chart with its
   * bottom cut off. So the budget below applies to these and nothing else —
   * the rest keep whatever height their content needs.
   */
  trimsOwnContent?: boolean;
}

export const WIDGETS: WidgetSpec[] = [
  {
    key: "greeting",
    mobileRank: 0,
    label: "Greeting & date",
    hint: "The day, and your name",
    pinned: true,
    preferred: { w: 36, h: 5 },
  },
  {
    key: "day",
    trimsOwnContent: true,
    mobileRank: 10,
    label: "A look at today",
    hint: "Today's events and to-dos",
    preferred: { w: 12, h: 18 },
  },
  {
    key: "agenda",
    trimsOwnContent: true,
    mobileRank: 30,
    label: "Agenda",
    hint: "The next fortnight, in order",
    preferred: { w: 12, h: 19 },
  },
  {
    key: "upcoming",
    trimsOwnContent: true,
    mobileRank: 20,
    label: "Upcoming",
    hint: "The next few days",
    preferred: { w: 12, h: 18 },
  },
  {
    key: "focus",
    mobileRank: 40,
    label: "Focus timer",
    hint: "One stretch of work",
    preferred: { w: 12, h: 7 },
    min: { w: 9, h: 6 },
  },
  {
    key: "river",
    mobileRank: 80,
    label: "Your rhythm",
    hint: "Activity over time, as a river",
    preferred: { w: 12, h: 11 },
    min: { w: 9, h: 7 },
  },
  {
    key: "chart",
    mobileRank: 70,
    label: "Two-week chart",
    hint: "A fortnight of what you tended to",
    preferred: { w: 36, h: 11 },
    min: { w: 12, h: 7 },
  },
  {
    key: "goals",
    mobileRank: 50,
    label: "Area progress",
    hint: "How your three areas are moving",
    preferred: { w: 18, h: 9 },
    min: { w: 9, h: 6 },
  },
  {
    key: "rhythm",
    mobileRank: 90,
    label: "Rhythm grid",
    hint: "Your weeks as shaded days",
    preferred: { w: 18, h: 9 },
    min: { w: 12, h: 7 },
  },
  {
    key: "balance",
    mobileRank: 100,
    label: "Where your attention went",
    hint: "The balance between your areas",
    preferred: { w: 12, h: 11 },
    min: { w: 9, h: 7 },
  },
  {
    key: "movement",
    mobileRank: 60,
    label: "How it's been going",
    hint: "Recent progress, in plain words",
    preferred: { w: 18, h: 9 },
    min: { w: 9, h: 6 },
  },
];

const BY_KEY = new Map(WIDGETS.map((w) => [w.key, w]));

export function widgetSpec(key: string): WidgetSpec | undefined {
  return BY_KEY.get(key);
}

export function widgetLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Whether a phone may put a height budget on this widget — see the field. */
export function trimsOwnContent(key: string): boolean {
  return BY_KEY.get(key)?.trimsOwnContent === true;
}

/** Order for the single column a phone gets. Unknown keys sort last. */
export function mobileRank(key: string): number {
  return BY_KEY.get(key)?.mobileRank ?? 999;
}

export function isPinned(key: string): boolean {
  return BY_KEY.get(key)?.pinned === true;
}

/** Everything a person can actually put on or take off the board. */
export const MOVABLE_WIDGETS = WIDGETS.filter((w) => !w.pinned);
