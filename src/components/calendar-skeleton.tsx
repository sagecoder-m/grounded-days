import { format } from "date-fns";

/**
 * How tall the calendar box is, in one place.
 *
 * Both the real calendar and the placeholder use this. They were separate
 * values and drifted immediately: the box was h-[32rem] on a phone while the
 * placeholder was a fixed 40rem, so a phone loaded a 640px stand-in and then
 * snapped to a 512px calendar — a 128px jump, which is the mobile flash.
 *
 * Taller on a phone than it was. 32rem gave a day view about seven hours before
 * it scrolled internally, on the one screen where vertical space is the only
 * dimension there is — a single narrow column has nowhere else to grow. svh
 * rather than vh so it does not jump when mobile browser chrome hides, with a
 * floor for landscape.
 */
export const CALENDAR_BOX = "min-h-[32rem] h-[78svh] md:h-[42rem]";

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
 * It fills its box rather than adding up to a height, which is the part I got
 * wrong twice. Computed row heights had to be re-measured every time anything
 * above them changed — adding the toolbar row put it 62px out — and they could
 * only ever be right at one breakpoint, which is how the phone ended up with a
 * 640px stand-in in front of a 512px calendar. Six flex rows inside the shared
 * CALENDAR_BOX cannot be wrong at any width: it is the same box the real
 * calendar gets, so it is the same height by construction.
 *
 * Seven columns even on a phone, where the real view is a single day. The
 * columns are hairlines on an empty card at that size, so what a phone actually
 * sees is a calendar-shaped rectangle of the right height — and a stand-in that
 * matched the day view's exact internals would be a second thing to maintain
 * for a difference nobody can see in the half-second it is up.
 */
export function CalendarGridSkeleton({ heading = "Schedule" }: { heading?: string }) {
  return (
    <section aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your calendar</span>

      {/*
        The same header the real calendar has, chip for chip.

        Measured, because guessing was wrong: the boxes matched to the pixel and
        a phone still jumped 70px, all of it here. The real row carries the
        heading, three area filters and Add, and on a 375px screen that wraps to
        three lines — 98px against the 28px a single-line placeholder took. So
        the placeholder wraps the same way, using the same flex-wrap container,
        and lands on the same height at every width without a number in it.
      */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg">{heading}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-6 w-24 rounded-full bg-secondary" />
          ))}
          <div className="h-7 w-16 animate-pulse rounded-full bg-secondary" />
        </div>
      </div>

      <div
        className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card ${CALENDAR_BOX}`}
      >
        {/* The view switcher's row. Kept as a bar rather than fake buttons: a
            placeholder that looks pressable invites a press that does nothing. */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-3 py-2.5">
          <div className="h-6 w-6 rounded-lg bg-secondary" />
          <div className="h-7 w-40 animate-pulse rounded-full bg-secondary sm:w-64" />
          <div className="h-6 w-16 rounded-full bg-secondary sm:w-24" />
        </div>

        {/* Weekday header, then six week rows that share what is left. Drawn
            with the grid's own hairlines so the real one lands on the same
            lines rather than beside them. */}
        <div className="grid shrink-0 grid-cols-7 border-b border-border">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="px-2 py-2">
              <div className="mx-auto h-2.5 w-6 rounded-full bg-secondary" />
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
          {Array.from({ length: 42 }, (_, i) => (
            <div
              key={i}
              className={`border-border ${i % 7 < 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""}`}
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
