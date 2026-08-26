import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Shared shell for the privacy policy and the terms.
 *
 * These are the two pages someone reads while deciding whether to trust the app
 * with their calendar, so they get the app's own typography and warmth rather
 * than the unstyled wall that legal pages usually are. A policy that looks like
 * it was pasted in is read as boilerplate nobody meant.
 *
 * Deliberately narrow — around 68 characters of prose per line, which is the
 * width text is comfortable to read at. Wide legal text is skipped, and these
 * are worth not skipping.
 */
export function LegalPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 md:py-16">
      <Link
        to="/"
        className="text-sm text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
      >
        grounded
      </Link>

      <h1 className="mt-6 font-serif text-2xl md:text-3xl">{title}</h1>
      <p className="mt-2 text-ink-soft">{lead}</p>

      <div className="mt-8 space-y-8">{children}</div>

      <p className="mt-12 border-t border-border pt-6 text-xs text-ink-soft">
        Grounded is a personal project in a private pilot, run by Mulanga Banza.
      </p>
    </div>
  );
}

export function UpdatedOn({ date }: { date: string }) {
  return <p className="text-xs uppercase tracking-[0.08em] text-ink-soft">Last updated {date}</p>;
}

/**
 * One titled block. The prose styling lives here rather than on each page so the
 * two documents cannot drift apart typographically, and so a link or a list
 * added later inherits the right treatment without anyone remembering to.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="
        space-y-3 text-[15px] leading-relaxed text-ink
        [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:text-ink-soft
        [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px]
        [&_li]:pl-1 [&_strong]:font-medium
        [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5
      "
    >
      <h2 className="font-serif text-lg">{title}</h2>
      {children}
    </section>
  );
}
