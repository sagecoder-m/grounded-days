import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Keyboard, PenLine } from "lucide-react";
import { toast } from "sonner";

import { dateKey } from "@/lib/dates";
import { actions, useAppState } from "@/lib/store";
import type { JournalEntry, Mood } from "@/lib/store-types";
import { affirmationForDate } from "@/lib/affirmations";
import { useMounted } from "@/lib/use-mounted";
import { usePenSurface } from "@/lib/use-pen-surface";
import { useSession } from "@/lib/use-session";
import { deleteInk, signedInkUrl, uploadInk } from "@/lib/journal-ink";
import { HandwritingPad } from "@/components/handwriting-pad";
import { JournalInkView } from "@/components/journal-ink-view";

export const Route = createFileRoute("/journal/")({
  component: JournalPage,
  /**
   * Which day is open, in the URL.
   *
   * It was component state, which meant the archive had nowhere to send you: a
   * list of every entry is only useful if the entries are reachable, and a link
   * needs somewhere to point. In the address bar it also survives a reload and
   * can be shared with yourself between devices.
   */
  validateSearch: (search: Record<string, unknown>): { date?: string } => {
    const date = typeof search.date === "string" ? search.date : undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? { date } : {};
  },
});

/** Words rather than a 1-5 scale — a number invites grading the day. */
const MOODS: { key: Mood; label: string; tint: string }[] = [
  { key: "low", label: "Low", tint: "var(--brown)" },
  { key: "tender", label: "Tender", tint: "var(--clay)" },
  { key: "steady", label: "Steady", tint: "var(--sage)" },
  { key: "good", label: "Good", tint: "var(--sage-deep)" },
  { key: "wired", label: "Wired", tint: "var(--tan)" },
];

const MOOD_TINT: Record<Mood, string> = Object.fromEntries(
  MOODS.map((m) => [m.key, m.tint]),
) as Record<Mood, string>;

function JournalPage() {
  const state = useAppState();
  const mounted = useMounted();
  const { date: fromUrl } = Route.useSearch();
  const navigate = useNavigate();

  const today = format(new Date(), "yyyy-MM-dd");
  const selected = fromUrl ?? today;
  const setSelected = (d: string) =>
    // Replace rather than push: stepping along the day strip should not build a
    // back-button history you have to click through to leave the page.
    navigate({ to: "/journal", search: d === today ? {} : { date: d }, replace: true });

  const entry = state.journal.find((e) => e.date === selected);
  /* Lifted out of Editor so the page can give the pad the full width. */
  const [handwriting, setHandwriting] = useState(false);
  const affirmation = affirmationForDate(selected);

  // Last two weeks, oldest first, for the strip.
  const strip = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => format(addDays(today, -13 + i), "yyyy-MM-dd"));
  }, []);

  if (!mounted) {
    return <div className="h-96 animate-pulse rounded-2xl bg-secondary/60" />;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="chip bg-secondary text-ink-soft">Journal</p>
        <h1 className="mt-3 font-serif text-2xl md:text-3xl">A few words is enough</h1>
        <p className="mt-2 max-w-lg text-ink-soft">
          No prompts you have to answer, no streak to keep. Write a sentence or leave it blank.
        </p>
      </header>

      {/*
        Writing on the left, everything about writing on the right.

        The affirmation and the fortnight of days used to sit above the box, so
        opening the journal meant scrolling past two things before reaching the
        one thing you came to do. They are context, not steps — moving them
        beside the box puts the cursor at the top of the page where it belongs.
      */}
      {/*
        The right-hand column steps aside while handwriting.

        Typed, the affirmation and the fortnight of days beside the box are
        useful context. Handwritten, they are taking a third of the width from
        the one thing that needs it: on an iPad the writing column came out
        around 380px, which is four or five words a line — the report was that
        there was nowhere to write, and this is half of why.
      */}
      <div
        className={
          handwriting ? "grid gap-8" : "grid gap-8 @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        }
      >
        <div>
          <Editor
            onModeChange={setHandwriting}
            key={selected}
            date={selected}
            body={entry?.body ?? ""}
            mood={entry?.mood}
            gratitude={entry?.gratitude ?? ""}
            inkPath={entry?.inkPath}
          />
        </div>

        <aside className="space-y-6">
          <p className="card-soft p-5 font-serif text-base leading-snug">{affirmation.text}</p>

          <DayStrip
            dates={strip}
            selected={selected}
            onSelect={setSelected}
            moodFor={(d) => state.journal.find((e) => e.date === d)?.mood}
            hasEntry={(d) => {
              const e = state.journal.find((x) => x.date === d);
              return Boolean(e && (e.body.trim() || e.gratitude?.trim() || e.mood));
            }}
          />

          <RecentEntries selected={selected} />

          {/* The week's shape, under the entries rather than below the box.
              It is a reading of the week, so it belongs with the other things
              you look at rather than with the one thing you write in — and it
              was leaving a column of empty page beside it. */}
          <WeeklyReview />
        </aside>
      </div>
    </div>
  );
}

/**
 * The last few entries, and the way to the rest of them.
 *
 * Until now a journal entry was reachable only by finding its day in a
 * fortnight-long strip, which meant anything written three weeks ago was, in
 * practice, gone. Writing that cannot be re-read is a diary with no point.
 */
function RecentEntries({ selected }: { selected: string }) {
  const state = useAppState();
  const written = useMemo(
    () =>
      state.journal
        .filter((e) => e.body.trim() || e.gratitude?.trim() || e.mood)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.journal],
  );

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Entries</h2>
        <Link
          to="/journal/all"
          className="text-xs text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
        >
          See all
        </Link>
      </div>

      {written.length === 0 ? (
        <p className="text-sm italic text-ink-soft">Nothing written down yet.</p>
      ) : (
        <div className="space-y-1">
          {written.slice(0, 6).map((e) => (
            <EntryLine key={e.date} entry={e} active={e.date === selected} />
          ))}
        </div>
      )}
    </section>
  );
}

/** One entry as a line: the day, its mood as a dot, and the first few words. */
export function EntryLine({ entry, active = false }: { entry: JournalEntry; active?: boolean }) {
  const firstLine = (entry.body.trim() || entry.gratitude?.trim() || "").split("\n")[0];

  return (
    <Link
      to="/journal"
      search={{ date: entry.date }}
      className={`float-row flex items-baseline gap-2.5 rounded-2xl border px-3 py-2 ${
        active ? "border-primary bg-accent" : "border-border bg-card"
      }`}
    >
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full border"
        style={{
          backgroundColor: entry.mood ? MOOD_TINT[entry.mood] : "transparent",
          borderColor: entry.mood ? MOOD_TINT[entry.mood] : "var(--ink-soft)",
        }}
      />
      <span className="w-14 shrink-0 text-[11px] text-ink-soft">
        {format(parseISO(entry.date), "MMM d")}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        {firstLine || <span className="italic text-ink-soft">Mood only</span>}
      </span>
    </Link>
  );
}

function DayStrip({
  dates,
  selected,
  onSelect,
  moodFor,
  hasEntry,
}: {
  dates: string[];
  selected: string;
  onSelect: (d: string) => void;
  moodFor: (d: string) => Mood | undefined;
  hasEntry: (d: string) => boolean;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {dates.map((d) => {
        const mood = moodFor(d);
        const isSelected = d === selected;
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs transition-colors ${
              isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            <span className="text-[10px] uppercase tracking-widest opacity-70">
              {format(parseISO(d), "EEEEE")}
            </span>
            <span className="tabular-nums">{format(parseISO(d), "d")}</span>
            {/* A filled dot for a mood, a hollow one for a written day with no
                mood, nothing for an untouched day. No red, no gaps to explain. */}
            <span
              className="h-1.5 w-1.5 rounded-full border"
              style={{
                backgroundColor: mood
                  ? isSelected
                    ? "var(--primary-foreground)"
                    : MOOD_TINT[mood]
                  : "transparent",
                borderColor: hasEntry(d)
                  ? isSelected
                    ? "var(--primary-foreground)"
                    : (mood && MOOD_TINT[mood]) || "var(--ink-soft)"
                  : "transparent",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function Editor({
  date,
  body,
  mood,
  gratitude,
  inkPath,
  onModeChange,
}: {
  date: string;
  body: string;
  mood?: Mood;
  gratitude: string;
  inkPath?: string;
  onModeChange?: (writing: boolean) => void;
}) {
  const [draftBody, setDraftBody] = useState(body);
  const [draftGratitude, setDraftGratitude] = useState(gratitude);
  const dirty = useRef(false);

  /*
    Handwriting is offered on a tablet and nowhere else — see usePenSurface for
    why that is detected rather than sniffed. A phone and a desktop still show
    any page already written, below; only the pad itself is withheld.
  */
  const canHandwrite = usePenSurface();
  const { user } = useSession();
  const [writing, setWriting] = useState(false);
  useEffect(() => onModeChange?.(writing), [writing, onModeChange]);
  const [savingInk, setSavingInk] = useState(false);

  /* The pad hands back a PNG on every stroke end. Uploading each one would be
     a request per stroke, so the newest blob is held and written once the hand
     has been still for a moment — the same debounce the text takes, and for the
     same reason. */
  const pendingInk = useRef<Blob | null>(null);
  const inkDirty = useRef(false);

  /* Any page already written for this day, so continuing it does not mean
     starting from a blank sheet. Signed URLs expire, so this is fetched rather
     than kept on the entry. */
  const [inkUrl, setInkUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!inkPath) {
      setInkUrl(null);
      return;
    }
    let cancelled = false;
    void signedInkUrl(inkPath).then((u) => !cancelled && setInkUrl(u));
    return () => {
      cancelled = true;
    };
  }, [inkPath]);

  useEffect(() => {
    if (!inkDirty.current || !user) return;
    const timer = window.setTimeout(async () => {
      const blob = pendingInk.current;
      inkDirty.current = false;
      setSavingInk(true);
      try {
        if (blob) {
          const path = await uploadInk(user.id, date, blob);
          actions.saveJournalEntry(date, { inkPath: path });
        } else {
          if (inkPath) await deleteInk(inkPath);
          actions.saveJournalEntry(date, { inkPath: null });
        }
      } catch {
        toast.error("That page couldn't be saved. Your typing is safe.");
      } finally {
        setSavingInk(false);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [date, user, inkPath]);

  // Debounced save. Writing per keystroke to a network store drops characters
  // when responses land out of order — the same reason the display name field
  // works this way.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      actions.saveJournalEntry(date, { body: draftBody, gratitude: draftGratitude });
      dirty.current = false;
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftBody, draftGratitude, date]);

  const isToday = date === format(new Date(), "yyyy-MM-dd");

  return (
    <section className="card-soft space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">
          {isToday ? "Today" : format(parseISO(date), "EEEE, MMMM d")}
        </h2>
        {isToday && (
          <span className="text-xs text-ink-soft">{format(parseISO(date), "MMMM d")}</span>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-ink-soft">
          How was it, roughly?
        </div>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => {
            const active = mood === m.key;
            return (
              <button
                key={m.key}
                onClick={() =>
                  // Tapping the active mood clears it. A mood you cannot unset
                  // is a mood you have to lie about.
                  actions.saveJournalEntry(date, { mood: active ? null : m.key })
                }
                aria-pressed={active}
                className="chip"
                style={
                  active
                    ? { backgroundColor: m.tint, color: "var(--primary-foreground)" }
                    : { backgroundColor: "var(--secondary)", color: "var(--ink-soft)" }
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="journal-body"
          className={`block text-[10px] uppercase tracking-widest text-ink-soft ${
            writing ? "sr-only" : ""
          }`}
        >
          Anything you want to put down
        </label>
        <textarea
          hidden={writing}
          id="journal-body"
          value={draftBody}
          onChange={(e) => {
            dirty.current = true;
            setDraftBody(e.target.value);
          }}
          rows={4}
          placeholder="One sentence is a complete entry."
          className="w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary"
        />

        {/*
          Type or handwrite, as a switch rather than a link.

          It was "Write by hand instead", which read as a one-way door and left
          both surfaces on screen at once. A day is written one way or the
          other; the switch says so, and either way the entry is the same day —
          swapping back does not throw away what is already there.
        */}
        {canHandwrite && (
          /*
            inline-flex, not flex.

            A block-level flex container fills its parent, so on the page this
            stretched the full width of the editor with the two buttons crammed
            into the left end of a wide empty pill — it read as a broken input
            rather than a switch. inline-flex sizes it to its own content, which
            is what a segmented control is.
          */
          <div className="inline-flex overflow-hidden rounded-full border border-tan text-xs">
            <button
              type="button"
              onClick={() => setWriting(false)}
              aria-pressed={!writing}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                !writing ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary"
              }`}
            >
              <Keyboard className="h-3.5 w-3.5" />
              Type
            </button>
            <button
              type="button"
              onClick={() => setWriting(true)}
              aria-pressed={writing}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                writing ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-secondary"
              }`}
            >
              <PenLine className="h-3.5 w-3.5" />
              Handwrite
            </button>
          </div>
        )}

        {canHandwrite && writing && (
          <div className="space-y-2">
            <HandwritingPad
              initialImage={inkUrl}
              onChange={(blob) => {
                pendingInk.current = blob;
                inkDirty.current = true;
              }}
            />
            <p className="text-xs italic text-ink-soft">
              {savingInk ? "Saving your page…" : "Saved as you write."}
            </p>
          </div>
        )}

        {/* The page as it stands, on every device. Reading is never gated —
            an entry you cannot open on your phone is an entry you have lost. */}
        {inkPath && !writing && <JournalInkView path={inkPath} alt={`Handwriting from ${date}`} />}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="journal-gratitude"
          className="block text-[10px] uppercase tracking-widest text-ink-soft"
        >
          One good thing
        </label>
        <input
          id="journal-gratitude"
          value={draftGratitude}
          onChange={(e) => {
            dirty.current = true;
            setDraftGratitude(e.target.value);
          }}
          placeholder="However small."
          className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <p className="text-[11px] italic text-ink-soft">Saves itself as you write.</p>
    </section>
  );
}

/**
 * Derived, not stored.
 *
 * A review is a reading of data that already exists, so computing it on the fly
 * means it is never stale and there is nothing to migrate. It also cannot be
 * "missed" — there is no weekly artifact sitting there unwritten, reproaching
 * you for the week you did not review.
 */
function WeeklyReview() {
  const state = useAppState();

  const review = useMemo(() => {
    const weekStart = startOfWeek(new Date());
    const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));
    const inWeek = (d?: string) => Boolean(d && days.includes(d));

    const tasksDone = state.tasks.filter((t) => t.done && inWeek(t.date)).length;
    const habitTicks = state.habits.reduce(
      (sum, h) => sum + days.filter((d) => h.log[d]).length,
      0,
    );
    const stepsDone = state.goals.reduce((sum, g) => sum + g.steps.filter((s) => s.done).length, 0);
    const focusMinutes = state.focusSessions
      .filter((f) => days.includes(dateKey(new Date(f.completedAt))))
      .reduce((sum, f) => sum + f.minutes, 0);

    const entries = state.journal.filter((e) => days.includes(e.date));
    const moods = entries.map((e) => e.mood).filter(Boolean) as Mood[];
    const commonMood = moods.length
      ? [...new Set(moods)].sort(
          (a, b) => moods.filter((m) => m === b).length - moods.filter((m) => m === a).length,
        )[0]
      : undefined;
    const gratitudes = entries
      .map((e) => e.gratitude?.trim())
      .filter((g): g is string => Boolean(g));

    // The steadiest habit, named rather than ranked — "most consistent" is a
    // fact about the week, not a score to beat.
    const steadiest = [...state.habits]
      .map((h) => ({ name: h.name, count: days.filter((d) => h.log[d]).length }))
      .sort((a, b) => b.count - a.count)[0];

    return {
      weekLabel: `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`,
      tasksDone,
      habitTicks,
      stepsDone,
      focusMinutes,
      entryCount: entries.length,
      commonMood,
      gratitudes,
      steadiest: steadiest && steadiest.count > 0 ? steadiest : undefined,
    };
  }, [state]);

  const nothingYet =
    review.tasksDone === 0 &&
    review.habitTicks === 0 &&
    review.entryCount === 0 &&
    review.focusMinutes === 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">This week</h2>
        <span className="text-xs text-ink-soft">{review.weekLabel}</span>
      </div>

      {nothingYet ? (
        <div className="card-soft p-6 text-center text-sm italic text-ink-soft">
          The week is still young. Nothing to read into yet.
        </div>
      ) : (
        <div className="card-soft space-y-4 p-5">
          {/* Four across when the column can hold them, two by two when it
              cannot. A container query rather than a screen one: this sits in a
              sidebar on a wide window and full width on a phone, so what
              matters is the width of the card, not of the display. */}
          <div className="@container">
            <div className="grid grid-cols-2 gap-4 @xs:grid-cols-4">
              <Stat label="tasks done" value={review.tasksDone} />
              <Stat label="habit days" value={review.habitTicks} />
              <Stat label="goal steps" value={review.stepsDone} />
              <Stat label="focus minutes" value={review.focusMinutes} />
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            {review.steadiest && (
              <p>
                Steadiest habit was <span className="font-medium">{review.steadiest.name}</span>, on{" "}
                {review.steadiest.count} {review.steadiest.count === 1 ? "day" : "days"}.
              </p>
            )}
            {review.commonMood && (
              <p>
                Most days felt{" "}
                <span className="font-medium">
                  {MOODS.find((m) => m.key === review.commonMood)?.label.toLowerCase()}
                </span>
                . That is worth knowing, not fixing.
              </p>
            )}
            {review.entryCount > 0 && (
              <p className="text-ink-soft">
                You wrote on {review.entryCount} {review.entryCount === 1 ? "day" : "days"}.
              </p>
            )}
          </div>

          {review.gratitudes.length > 0 && (
            <div className="border-t border-border pt-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-ink-soft">
                Good things you noted
              </div>
              <ul className="space-y-1 text-sm">
                {review.gratitudes.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-soft">·</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-serif text-3xl tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-soft">{label}</div>
    </div>
  );
}
