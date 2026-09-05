import { useEffect, useState } from "react";

import { signedInkUrl } from "@/lib/journal-ink";

/**
 * A handwritten page, shown back.
 *
 * Deliberately not gated by device. Writing needs a tablet; reading needs
 * nothing, and an entry you cannot open on your phone is an entry you have
 * lost — which would make the whole feature a liability rather than a way to
 * keep a journal.
 *
 * The URL is signed and expires, so it is fetched per view rather than stored
 * with the entry.
 */
export function JournalInkView({ path, alt }: { path: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void signedInkUrl(path)
      .then((next) => {
        if (cancelled) return;
        if (next) setUrl(next);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm italic text-ink-soft">
        This page couldn't be loaded just now.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {url ? (
        <img
          src={url}
          alt={alt ?? "A handwritten journal page"}
          /*
            Full width, natural height. A handwritten page has a shape the
            person chose by writing on it; cropping it to a tidy box would cut
            off the end of their own sentences.

            Inverted in dark mode, matching the pad. Pages are stored with dark
            ink on transparency — one stored form so a page written in one theme
            is legible in the other — and the flip happens at paint time here.
          */
          className="block w-full dark:invert"
        />
      ) : (
        <div className="h-48 animate-pulse bg-secondary/40" />
      )}
    </div>
  );
}
