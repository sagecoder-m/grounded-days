import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * The charts on a phone, behind one line you can tap.
 *
 * A pilot user described the mobile Overview as overwhelming, and the charts
 * were most of why. They are not bad widgets — they answer "how did the last
 * fortnight go", which is a real question. They are simply not the question
 * anyone opens this app to ask first thing in the morning, and on a wide board
 * that costs nothing because they sit off to one side where the eye can skip
 * them. One column removes the skipping: four full panels, unavoidable, between
 * you and the end of the page.
 *
 * So they fold. Named rather than hidden — the line lists what is inside, so
 * this reads as a drawer someone closed rather than features that went missing,
 * and anyone who wants them is one tap from all four.
 *
 * Closed on arrival every time, deliberately not remembered. Somewhere to put
 * the open/closed flag is easy; the reason not to is that the value of this is
 * the phone starting on today, and a preference that survives would quietly
 * undo that for exactly the people who most need it. Looking back stays
 * something you ask for.
 *
 * Phone only. The wide board never renders this — the widgets are back where
 * they were put, at the size they were given.
 */
export function MobileReflection({ labels, children }: { labels: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="float-row flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-base">Looking back</span>
          {/* What is in the drawer, in the widgets' own words. Named from the
              board rather than written here, so a drawer holding three things
              says three and a board with the charts removed never offers it. */}
          <span className="mt-0.5 block truncate text-xs text-ink-soft">{labels.join(" · ")}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {/* Mounted only when open. These are charts: they measure, they animate on
          entry, and several read the whole event history to draw themselves.
          Rendering four of them into a hidden container would make every phone
          pay for the thing this exists to defer. */}
      {open && <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>}
    </section>
  );
}
