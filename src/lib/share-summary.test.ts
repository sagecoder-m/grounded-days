import { describe, expect, it } from "vitest";

import { summarise } from "./share-summary";
import type { Area } from "./store-types";

const TODAY = "2026-09-01";
const SINCE = "2026-07-07";

function run(over: Partial<Parameters<typeof summarise>[0]> = {}) {
  return summarise({
    since: SINCE,
    today: TODAY,
    areas: ["personal", "professional", "education"] as Area[],
    completions: [],
    openWork: [],
    goals: [],
    habitCheckins: [],
    ...over,
  });
}

const all = (s: { sentences: string[] }) => s.sentences.join(" ");

/**
 * These are mostly tests about words, which is unusual and deliberate.
 *
 * The page is read by a therapist, a partner or a parent, and often by the
 * person it describes before they send it. A sentence that lands as a report
 * card is the failure mode that matters — it is what stops the link being
 * shared at all — and it is exactly the kind of regression a later edit
 * reintroduces without noticing, because it still "reads fine" to whoever is
 * writing the code.
 */
describe("summarise", () => {
  it("opens on what was done, not on what was not", () => {
    const s = run({
      completions: [
        { area: "personal", date: "2026-08-20" },
        { area: "personal", date: "2026-08-21" },
        { area: "education", date: "2026-08-22" },
      ],
    });
    expect(s.sentences[0]).toContain("3 things were finished");
    expect(s.sentences[0]).toContain("most of it in Personal");
  });

  it("never uses shaming vocabulary", () => {
    const s = run({
      completions: [{ area: "personal", date: "2026-08-20" }],
      openWork: [
        { area: "education", date: "2026-08-01" },
        { area: "education", date: "2026-08-02" },
        { area: "professional", date: null },
      ],
      goals: [{ area: "personal", progress: 40 }],
      habitCheckins: [{ date: "2026-08-20" }],
    });
    const text = all(s).toLowerCase();
    for (const word of [
      "overdue",
      "late",
      "missed",
      "failed",
      "behind",
      "streak",
      "should",
      "only",
      "struggling",
      "poor",
    ]) {
      expect(text, `"${word}" must not appear`).not.toContain(word);
    }
  });

  it("calls work past its date waiting, and points somewhere to start", () => {
    const s = run({
      openWork: [
        { area: "education", date: "2026-08-01" },
        { area: "education", date: "2026-08-02" },
        { area: "personal", date: "2026-08-30" },
      ],
    });
    expect(all(s)).toContain("Education has 2 things waiting");
    expect(all(s)).toContain("start a conversation");
    expect(s.needsSupport[0]).toBe("education");
  });

  it("ranks support by what is waiting, not by what is undone", () => {
    // Professional has far more open work but none of it is past its date.
    // An area nobody is working in this month is a choice, not a difficulty.
    const s = run({
      openWork: [
        ...Array.from({ length: 9 }, () => ({ area: "professional" as Area, date: null })),
        { area: "personal", date: "2026-08-01" },
      ],
    });
    expect(s.needsSupport).toEqual(["personal"]);
  });

  it("says so plainly when nothing is waiting", () => {
    const s = run({
      completions: [{ area: "personal", date: "2026-08-20" }],
      habitCheckins: [{ date: "2026-08-20" }, { date: "2026-08-21" }],
    });
    expect(all(s)).toContain("Nothing is sitting past its date");
    expect(s.needsSupport).toEqual([]);
  });

  it("reads a quiet stretch as a stretch, not a verdict", () => {
    const s = run({ openWork: [{ area: "personal", date: null }] });
    expect(all(s)).toContain("can mean a hard stretch");
    // No count of what was not done anywhere in it.
    expect(all(s)).not.toMatch(/\d+%/);
  });

  it("treats an untouched account as new rather than sad", () => {
    const s = run();
    expect(s.empty).toBe(true);
    expect(all(s)).toContain("new or quiet space");
  });

  it("keeps quiet weeks in the run", () => {
    // Dropping empty weeks would draw a steadier line than the one lived.
    const s = run({ completions: [{ area: "personal", date: "2026-08-20" }] });
    expect(s.weeks.length).toBeGreaterThan(6);
    expect(s.weeks.filter((w) => w.total === 0).length).toBeGreaterThan(0);
    expect(s.weeks.map((w) => w.weekStart)).toEqual([...s.weeks.map((w) => w.weekStart)].sort());
  });

  it("counts habit days without ever scoring them", () => {
    const s = run({
      completions: [{ area: "personal", date: "2026-08-20" }],
      habitCheckins: [{ date: "2026-08-20" }, { date: "2026-08-20" }, { date: "2026-08-21" }],
    });
    // Two distinct days, not three check-ins, and no denominator judgement.
    expect(s.habitDays).toBe(2);
    expect(all(s)).not.toContain("%");
  });

  it("only reports areas the link actually covers", () => {
    const s = run({
      areas: ["education"],
      completions: [
        { area: "personal", date: "2026-08-20" },
        { area: "education", date: "2026-08-21" },
      ],
    });
    expect(s.standings.map((x) => x.area)).toEqual(["education"]);
  });

  it("states goal progress without grading it", () => {
    const s = run({
      completions: [{ area: "personal", date: "2026-08-20" }],
      goals: [
        { area: "personal", progress: 20 },
        { area: "personal", progress: 60 },
      ],
    });
    expect(s.standings[0].goalProgress).toBe(40);
    expect(all(s)).toContain("Goals are underway in Personal");
  });
});

describe("no denominators", () => {
  /*
    The rule one step past vocabulary, and the one I broke while building the
    page: "tended on 17 of the last 56 days" is factually neutral and hands the
    reader a subtraction. Presence is stated; absence is left alone.
  */
  it("never states a count against a total", () => {
    const s = summarise({
      since: SINCE,
      today: TODAY,
      areas: ["personal", "professional", "education"] as Area[],
      completions: [{ area: "personal", date: "2026-08-20" }],
      openWork: [],
      goals: [],
      habitCheckins: [{ date: "2026-08-20" }, { date: "2026-08-21" }],
    });
    const text = s.sentences.join(" ");
    expect(text).toMatch(/2 days/);
    expect(text, "a count against a total invites a subtraction").not.toMatch(
      /\bof the last \d+ days/,
    );
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});
