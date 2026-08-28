import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Search } from "lucide-react";

import { useAppState } from "@/lib/store";
import type { JournalEntry } from "@/lib/store-types";
import { useMounted } from "@/lib/use-mounted";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/journal/all")({
  component: AllEntriesPage,
});

/**
 * Everything ever written, by month.
 *
 * The journal could only reach the last fortnight, through a strip of days —
 * which meant anything written three weeks ago was, for practical purposes,
 * gone. Writing you cannot re-read is a diary with no point, and the whole
 * argument for keeping one is that later you get to look back.
 *
 * Grouped by month rather than paginated. A journal is read by wandering, not
 * by paging, and month headings are the landmarks people actually navigate by
 * — "some time in June" is how anyone recalls when they wrote something.
 *
 * No streak line, no "you wrote on 14 of 30 days". The count of days you did
 * not write is exactly the number this app refuses to put in front of anyone.
 */
function AllEntriesPage() {
  const state = useAppState();
  const mounted = useMounted();
  const [query, setQuery] = useState("");

  const months = useMemo(() => {
    const term = query.trim().toLowerCase();
    const written = state.journal
      .filter((e) => e.body.trim() || e.gratitude?.trim() || e.mood)
      .filter((e) => (term ? `${e.body} ${e.gratitude ?? ""}`.toLowerCase().includes(term) : true))
      .sort((a, b) => b.date.localeCompare(a.date));

    const byMonth = new Map<string, JournalEntry[]>();
    for (const entry of written) {
      const key = entry.date.slice(0, 7);
      const bucket = byMonth.get(key);
      if (bucket) bucket.push(entry);
      else byMonth.set(key, [entry]);
    }
    return [...byMonth.entries()];
  }, [state.journal, query]);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  const nothingAtAll = state.journal.every(
    (e) => !e.body.trim() && !e.gratitude?.trim() && !e.mood,
  );

  return (
    <div className="space-y-8">
      <header>
        <Link
          to="/journal"
          className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to today
        </Link>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">Everything you&rsquo;ve written</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          Yours to wander through. Nothing here is counted or scored.
        </p>
      </header>

      {!nothingAtAll && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a word"
            aria-label="Search your entries"
            className="pl-9"
          />
        </div>
      )}

      {nothingAtAll ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm italic text-ink-soft">
          Nothing written down yet. One sentence is a complete entry.
        </p>
      ) : months.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm italic text-ink-soft">
          No entry has that word in it.
        </p>
      ) : (
        <div className="space-y-10">
          {months.map(([month, entries]) => (
            <section key={month}>
              <h2 className="mb-3 font-serif text-lg">
                {format(parseISO(`${month}-01`), "MMMM yyyy")}
              </h2>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <EntryCard key={entry.date} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One day, readable at a glance and openable in full.
 *
 * The body is clamped rather than truncated with an ellipsis: three lines of a
 * long entry is enough to recognise the day, and the fade of a clamp reads as
 * "there is more" without a control saying so.
 */
function EntryCard({ entry }: { entry: JournalEntry }) {
  return (
    <Link
      to="/journal"
      search={{ date: entry.date }}
      className="float-row block rounded-2xl border border-border bg-card px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-serif text-base">{format(parseISO(entry.date), "EEEE, MMMM d")}</span>
        {entry.mood && (
          <span className="chip bg-secondary text-[10px] capitalize text-ink-soft">
            {entry.mood}
          </span>
        )}
      </div>

      {entry.body.trim() && (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink">
          {entry.body}
        </p>
      )}

      {entry.gratitude?.trim() && (
        <p className="mt-2 text-xs italic text-ink-soft">One good thing: {entry.gratitude}</p>
      )}

      {!entry.body.trim() && !entry.gratitude?.trim() && (
        <p className="mt-2 text-xs italic text-ink-soft">A mood, and that was enough.</p>
      )}
    </Link>
  );
}
