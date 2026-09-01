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
 * A stand-in for the grid, at the grid's own height.
 *
 * The height is the whole point. A short placeholder that becomes a tall
 * calendar shoves the page down the moment it resolves, which is the jump that
 * reads as a glitch even when the wait was brief.
 *
 * 40rem is measured against the real month grid, not guessed: the two came out
 * 648px and 678px at 38rem, so this closes the remaining thirty. It cannot be
 * exact for every view — a week grid and an agenda are different heights — but
 * month is what most people open onto, and being close everywhere beats being
 * right once.
 */
export function CalendarGridSkeleton({ heading = "Schedule" }: { heading?: string }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your calendar</span>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg">{heading}</h2>
        <div className="h-6 w-40 animate-pulse rounded-full bg-secondary" />
      </div>
      <div className="h-[40rem] animate-pulse rounded-2xl border border-border bg-secondary/50" />
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
