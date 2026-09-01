import { useEffect, useState } from "react";

export interface SectionLink {
  /** The id on the section's own element. */
  id: string;
  label: string;
}

/**
 * A way through a long page, for the screen where it is longest.
 *
 * Each area page is four to six stacked sections — Personal runs a chart, the
 * habit grid, loose tasks and goals. On a wide screen they sit side by side and
 * you take the shape in at a glance. On a phone that becomes one column you can
 * only meet in order, and reaching your goals means scrolling past everything
 * else every time. The complaint was that it feels like a lot, and it is: not
 * because any section is wrong, but because the page gives no way to skip.
 *
 * So this is a row of the page's own section names that jumps to one. Nothing
 * is hidden and nothing collapses — the page is unchanged, it just becomes
 * navigable. Hiding sections behind taps would make the same page harder to
 * read for the person who does want to scroll it.
 *
 * It also marks where you are, which is the half that makes it a navigator
 * rather than a list of links: on a long scroll the useful question is usually
 * "where am I" before "where do I go".
 *
 * Phone only. On a wide screen the sections are already visible together, and a
 * jump list for a page you can see all of is furniture.
 */
export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  /*
    IntersectionObserver rather than a scroll handler: it fires only when a
    section crosses the line, not on every frame of every scroll, which on a
    phone is the difference between a smooth page and a warm one.

    The margin puts the trigger line a third of the way down the viewport. A
    section counts as "the one you are reading" when its top passes that,
    which matches where the eye actually sits — using the very top means the
    heading you are reading is never the one marked.
  */
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);

        /*
          Highest on screen wins, measured — not first in this array.

          Array order is a reading order I chose; DOM order is whatever the
          page's grid produces when it collapses to one column, and on the
          Education page those genuinely differ. Picking by array position
          would then mark a section further down the page than the one you are
          looking at, which is worse than not marking anything. Comparing rects
          needs no assumption about either order.
        */
        let best: string | null = null;
        let bestTop = Infinity;
        for (const s of sections) {
          if (!seen.get(s.id)) continue;
          const top = document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity;
          if (top < bestTop) {
            bestTop = top;
            best = s.id;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-33% 0px -55% 0px", threshold: 0 },
    );

    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null);
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Sections on this page"
      /*
        Sticky, under the app's own header. A jump list that scrolls away is
        one you can only use from the top of the page, which is the one place
        you do not need it.

        Horizontally scrollable rather than wrapping, so it stays one line
        however many sections a page has — two lines of chips is a second
        block of page furniture above the content.
      */
      className="sticky top-[6.5rem] z-20 -mx-4 mb-4 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur md:hidden"
    >
      <ul className="flex w-max items-center gap-1.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={(e) => {
                /*
                  Handled here rather than left to the browser so the landing
                  spot clears the two sticky bars above it — a raw anchor jump
                  puts the heading underneath them, so you arrive at a section
                  whose name you cannot see.
                */
                const el = document.getElementById(s.id);
                if (!el) return;
                e.preventDefault();
                const top = el.getBoundingClientRect().top + window.scrollY - 150;
                window.scrollTo({ top, behavior: "smooth" });
                setActive(s.id);
              }}
              className={`chip whitespace-nowrap transition-colors ${
                active === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-ink-soft"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
