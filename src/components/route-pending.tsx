/**
 * What a page looks like while it is still arriving.
 *
 * Every route is code-split, so opening one for the first time means fetching
 * its chunk. The router keeps the *previous* page on screen until the new one
 * is ready, which for a light page is invisible and for the calendar is not:
 * DayFlow is by far the largest thing this app loads, and clicking Calendar
 * left the page you came from sitting there — URL already changed, content
 * still the old one — for long enough to read as a broken link.
 *
 * Deliberately not a spinner. A spinner says "something is wrong and I am
 * trying"; this is an ordinary wait of a few hundred milliseconds, and the
 * calm equivalent is a shape where the content will be. It breathes rather
 * than spins, and it uses the same tokens and radii as the cards it stands in
 * for, so the arrival is a sharpening rather than a swap.
 */
export function RoutePending() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* A heading's worth of space, then a page's worth. The proportions are
          the common shape of every page in this app: a title, a line of
          description, then a wide panel. */}
      <div className="space-y-3">
        <div className="h-3 w-32 animate-pulse rounded-full bg-secondary" />
        <div className="h-7 w-64 animate-pulse rounded-full bg-secondary" />
        <div className="h-3 w-80 max-w-full animate-pulse rounded-full bg-secondary/70" />
      </div>

      <div className="h-72 animate-pulse rounded-2xl border border-border bg-secondary/50" />
    </div>
  );
}
