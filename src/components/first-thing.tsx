import { useState } from "react";

import { actions, todayISO } from "@/lib/store";
import type { AppState } from "@/lib/store-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What a brand-new account sees instead of an empty board.
 *
 * Before this, signing in for the first time meant landing on four widgets each
 * saying a different version of "nothing yet" — four simultaneous statements of
 * absence and no indication of where to begin. For anyone whose difficulty is
 * starting rather than doing, that is the hardest possible opening.
 *
 * Deliberately not a wizard. No steps, no progress dots, no tour, nothing to
 * dismiss and no "skip" to feel bad about skipping. A tour asks you to hold
 * several new things in your head before you have done anything; this asks for
 * one sentence.
 *
 * One field and one button, on purpose. Offering three ways to start would be
 * three decisions before the first action, which is the problem restated rather
 * than solved. A task for today is the choice most likely to be useful and the
 * easiest to undo.
 *
 * It ends by itself. There is no flag and nothing to reset: the moment the
 * account holds anything at all the Overview renders the board instead, so this
 * cannot linger or be seen twice by someone who is already going.
 */

/** Nothing anywhere. Deliberately every kind of content, not just tasks, so
 *  someone who started with a habit or a journal line is never sent back here. */
export function isNewAccount(state: AppState): boolean {
  return (
    state.tasks.length === 0 &&
    state.habits.length === 0 &&
    state.goals.length === 0 &&
    state.journal.length === 0 &&
    state.courses.length === 0 &&
    state.projects.length === 0 &&
    state.focusSessions.length === 0 &&
    state.events.filter((e) => e.source === "local").length === 0
  );
}

export function FirstThing({ onLookAround }: { onLookAround: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    // Personal by default rather than asking. The area is changeable in one tap
    // afterwards, and picking one here would be a second decision before the
    // first thing is even written down.
    actions.addTask({ area: "personal", title: text, date: todayISO() });
    setTitle("");
    setBusy(false);
  }

  return (
    <section className="mx-auto max-w-lg py-6">
      <div className="card-soft p-6 md:p-8">
        <h2 className="font-serif text-xl">Start with one thing</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Not a plan, not a system &mdash; just one thing you would like to do today. The rest of
          this fills in around it.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Water the plants"
            aria-label="One thing you would like to do today"
            autoFocus
          />
          <Button type="submit" disabled={!title.trim()} className="w-full rounded-full">
            Add it
          </Button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-ink-soft">
          Habits, goals, your journal and your calendar are all in the tabs above, there whenever
          you want them. Nothing here needs setting up first.
        </p>
      </div>

      {/* Quiet, and below the fold of attention: someone who wants to look before
          they touch anything should be able to, without it being the loudest
          option on the screen. */}
      <p className="mt-4 text-center">
        <button
          type="button"
          onClick={onLookAround}
          className="text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          Or look around first
        </button>
      </p>
    </section>
  );
}
