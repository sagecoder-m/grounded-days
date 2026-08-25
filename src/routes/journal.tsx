import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";

import { dateKey } from "@/components/task-grid";
import { actions, useAppState } from "@/lib/store";
import type { Mood } from "@/lib/store-types";
import { affirmationForDate } from "@/lib/affirmations";
import { useMounted } from "@/lib/use-mounted";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
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
  const [selected, setSelected] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const entry = state.journal.find((e) => e.date === selected);
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

      <p className="card-soft p-5 font-serif text-lg leading-snug">{affirmation.text}</p>

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

      <Editor
        key={selected}
        date={selected}
        body={entry?.body ?? ""}
        mood={entry?.mood}
        gratitude={entry?.gratitude ?? ""}
      />

      <WeeklyReview />
    </div>
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
}: {
  date: string;
  body: string;
  mood?: Mood;
  gratitude: string;
}) {
  const [draftBody, setDraftBody] = useState(body);
  const [draftGratitude, setDraftGratitude] = useState(gratitude);
  const dirty = useRef(false);

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
          className="block text-[10px] uppercase tracking-widest text-ink-soft"
        >
          Anything you want to put down
        </label>
        <textarea
          id="journal-body"
          value={draftBody}
          onChange={(e) => {
            dirty.current = true;
            setDraftBody(e.target.value);
          }}
          rows={6}
          placeholder="One sentence is a complete entry."
          className="w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary"
        />
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="tasks done" value={review.tasksDone} />
            <Stat label="habit days" value={review.habitTicks} />
            <Stat label="goal steps" value={review.stepsDone} />
            <Stat label="focus minutes" value={review.focusMinutes} />
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
