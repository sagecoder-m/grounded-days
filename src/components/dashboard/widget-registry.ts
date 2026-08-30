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
  /** What it is called in the Add menu and the Profile list. */
  label: string;
  /** One line, for the Add menu. */
  hint: string;
  /** Where it goes and how big it is when first placed. */
  preferred: { w: number; h: number };
  /** Smallest it may be dragged down to. Overrides the board default when the
   *  content genuinely cannot survive the usual minimum. */
  min?: { w: number; h: number };
}

export const WIDGETS: WidgetSpec[] = [
  {
    key: "greeting",
    label: "Greeting & date",
    hint: "The day, and your name",
    preferred: { w: 36, h: 5 },
    min: { w: 12, h: 4 },
  },
  {
    key: "day",
    label: "A look at today",
    hint: "Today's events and to-dos",
    preferred: { w: 12, h: 18 },
  },
  {
    key: "upcoming",
    label: "Upcoming",
    hint: "The next few days",
    preferred: { w: 12, h: 18 },
  },
  {
    key: "focus",
    label: "Focus timer",
    hint: "One stretch of work",
    preferred: { w: 12, h: 7 },
    min: { w: 9, h: 6 },
  },
  {
    key: "river",
    label: "Your rhythm",
    hint: "Activity over time, as a river",
    preferred: { w: 12, h: 11 },
    min: { w: 9, h: 7 },
  },
  {
    key: "chart",
    label: "Two-week chart",
    hint: "A fortnight of what you tended to",
    preferred: { w: 36, h: 11 },
    min: { w: 12, h: 7 },
  },
  {
    key: "goals",
    label: "Area progress",
    hint: "How your three areas are moving",
    preferred: { w: 18, h: 9 },
    min: { w: 9, h: 6 },
  },
  {
    key: "rhythm",
    label: "Rhythm grid",
    hint: "Your weeks as shaded days",
    preferred: { w: 18, h: 9 },
    min: { w: 12, h: 7 },
  },
  {
    key: "balance",
    label: "Where your attention went",
    hint: "The balance between your areas",
    preferred: { w: 12, h: 11 },
    min: { w: 9, h: 7 },
  },
  {
    key: "movement",
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
