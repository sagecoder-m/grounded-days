import { format } from "date-fns";

/**
 * The calendar page while it is still arriving.
 *
 * This exists because the flashing people complained about was not one slow
 * thing, it was four fast ones. Opening the tab ran through the previous page,
 * then the router's generic placeholder, then the real header above a
 * differently-sized block, then the grid — four layouts, four heights, in about
 * a second. Each step was individually defensible and the sequence was awful.
 *
 * The fix is not to make any of them faster. It is to make them identical: the
 * header is real from the first frame because it needs no data to draw, and
 * every intermediate state uses the same grid-shaped block at the same height
 * as the grid it becomes. Nothing moves. The page stops being a slideshow and
 * becomes one thing that fills in.
 *
 * So this is deliberately shared rather than copied — the route's pending
 * component and the calendar's own not-ready state must render the *same*
 * markup, or the seam comes straight back.
 */

/** The page header. Static: it needs no data, so it should never be a skeleton. */
export function CalendarHeader() {
  return (
    <header>
      <p suppressHydrationWarning className="text-sm text-ink-soft">
        {format(new Date(), "EEEE, MMMM d, yyyy")}
      </p>
      <h1 className="mt-1 font-serif text-2xl md:text-3xl">Your calendar</h1>
      <p className="mt-2 max-w-lg text-ink-soft">
        Everything scheduled, in one quiet place. A day, a week, a month, or the whole year. Your
        tasks live on the overview.
      </p>
    </header>
  );
}

/**
 * A stand-in for the grid — shaped like the grid.
 *
 * The first version of this was one 40rem block of flat colour, pulsing. It got
 * the height right, which was the whole intent, and was horrible to look at: on
 * every hard refresh the page put up a large empty slab and breathed at you.
 * "Painful to the eye" was the report, and it was fair. Correct geometry is not
 * the same as a calm screen, and a big featureless rectangle is the loudest
 * thing this app has ever drawn.
 *
 * So it is a calendar instead: the toolbar bar, seven weekday columns, six week
 * rows, in the same borders and radii the real grid uses. Two things follow.
 * The wait stops looking like a wall and starts looking like a calendar with
 * nothing written on it yet, which is a quiet thing and nearly true. And the
 * swap to the real grid barely registers, because the shape is already right —
 * the cells simply gain their dates.
 *
 * No pulse on the grid, either. A shimmer across a full-page element is motion
 * you cannot look away from; the faint bars in the toolbar carry the "still
 * working" signal at a size where it does not dominate.
 *
 * Six rows at 5.85rem to land on 678px, which is what the real grid measures —
 * and measures in every view, day through agenda, because its container is a
 * fixed height. That is worth knowing: it means one placeholder is right for
 * all five views rather than only for the common one.
 */
export function CalendarGridSkeleton({ heading = "Schedule" }: { heading?: string }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your calendar</span>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg">{heading}</h2>
        <div className="h-6 w-40 animate-pulse rounded-full bg-secondary" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* The view switcher's row. Kept as a bar rather than fake buttons: a
            placeholder that looks pressable invites a press that does nothing. */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-3 py-2.5">
          <div className="h-6 w-6 rounded-lg bg-secondary" />
          <div className="h-7 w-64 animate-pulse rounded-full bg-secondary" />
          <div className="h-6 w-24 rounded-full bg-secondary" />
        </div>

        {/* Weekday header, then six week rows of empty cells. Drawn with the
            grid's own hairlines so the real one lands on top of the same lines. */}
        <div className="grid grid-cols-7 border-b border-border">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="px-2 py-2">
              <div className="mx-auto h-2.5 w-7 rounded-full bg-secondary" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 42 }, (_, i) => (
            <div
              key={i}
              className={`h-[5.85rem] border-border ${i % 7 < 6 ? "border-r" : ""} ${
                i < 35 ? "border-b" : ""
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The whole page, mid-flight. Used as the route's pending component. */
export function CalendarPending() {
  return (
    <div className="space-y-8">
      <CalendarHeader />
      <CalendarGridSkeleton />
    </div>
  );
}
