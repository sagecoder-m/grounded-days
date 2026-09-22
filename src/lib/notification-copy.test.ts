import { describe, expect, it } from "vitest";

import { formatDueTime, morningCopy, taskDueCopy, taskUrl } from "./notification-copy";

/**
 * A push notification is read on a lock screen, often by someone who did
 * not choose the moment. There is no scrollback to soften a bad sentence
 * with — this is the whole message. Mirrors the vocabulary guard already
 * proven at share-summary.test.ts:47, extended with the words specific to
 * being reminded of something rather than shown a summary of a season.
 */
const BANNED_WORDS = [
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
  "don't forget",
  "you haven't",
  "still",
  "again",
];

describe("taskUrl", () => {
  it("routes personal and education tasks to their flat area page", () => {
    expect(taskUrl({ id: "t1", area: "personal" })).toBe("/personal?taskId=t1");
    expect(taskUrl({ id: "t2", area: "education" })).toBe("/education?taskId=t2");
  });

  it("routes a professional task under its project", () => {
    expect(taskUrl({ id: "t3", area: "professional", projectId: "p1" })).toBe(
      "/professional/p1?taskId=t3",
    );
  });

  it("falls back to the professional root when the task has no project", () => {
    expect(taskUrl({ id: "t4", area: "professional" })).toBe("/professional?taskId=t4");
  });
});

describe("taskDueCopy", () => {
  it("names the task and its time, nothing else", () => {
    const copy = taskDueCopy({
      id: "t1",
      title: "Book the dentist",
      dueTime: "17:00",
      area: "personal",
    });
    expect(copy.title).toBe("Book the dentist");
    expect(copy.body).toBe("Due at 5:00 PM today.");
    expect(copy.url).toBe("/personal?taskId=t1");
  });

  it("prefixes a course tag when the task has one", () => {
    const copy = taskDueCopy({
      id: "t2",
      title: "Problem Set 3",
      dueTime: "23:59",
      courseTag: "OPAN 6605",
      area: "education",
    });
    expect(copy.title).toBe("OPAN 6605 · Problem Set 3");
    expect(copy.body).toBe("Due at 11:59 PM tonight.");
  });

  it("says 'tonight' from 6 PM on, and 'today' before it", () => {
    expect(
      taskDueCopy({ id: "t1", title: "x", dueTime: "17:59", area: "personal" }).body,
    ).toContain("today");
    expect(
      taskDueCopy({ id: "t1", title: "x", dueTime: "18:00", area: "personal" }).body,
    ).toContain("tonight");
  });

  it("never uses vocabulary that reads as a report card", () => {
    for (const word of BANNED_WORDS) {
      const text = taskDueCopy({
        id: "t1",
        title: `x ${word} y`,
        dueTime: "12:00",
        area: "personal",
      }).body.toLowerCase();
      expect(text, `"${word}" must not appear in the generated body`).not.toContain(word);
    }
  });
});

describe("morningCopy", () => {
  it("names one thing when there is one, and links to it", () => {
    const copy = morningCopy(
      { id: "t1", title: "Chase the signed form", area: "personal" },
      "Something today went quietly right.",
    );
    expect(copy.title).toBe("One thing today");
    expect(copy.body).toBe("Chase the signed form");
    expect(copy.url).toBe("/personal?taskId=t1");
  });

  it("falls back to the affirmation and the overview on a genuinely clear day", () => {
    const copy = morningCopy(null, "A slow day is still a day you were here for.");
    expect(copy.body).toBe("A slow day is still a day you were here for.");
    expect(copy.url).toBe("/");
  });

  it("is never a list or a count", () => {
    const copy = morningCopy(
      { id: "t1", title: "Chase the signed form", area: "personal" },
      "fallback",
    );
    expect(copy.body).not.toMatch(/\d+\s*(things|tasks|items)/i);
    expect(copy.body).not.toContain(",");
  });

  it("adds no vocabulary of its own", () => {
    // morningCopy is a pass-through for whatever pickOneThing or the
    // affirmation already chose — it contributes only the fixed title, so
    // that is the only string worth holding to the vocabulary rule here.
    // The picked task's own words and the affirmation text are guarded
    // elsewhere: a task title is the person's own wording, and the
    // affirmations themselves are reviewed, hand-written copy (see
    // affirmations.ts) rather than anything generated.
    for (const word of BANNED_WORDS) {
      expect(
        morningCopy(
          { id: "t1", title: "anything", area: "personal" },
          "anything",
        ).title.toLowerCase(),
      ).not.toContain(word);
    }
  });
});

describe("formatDueTime", () => {
  it("formats midnight and noon correctly", () => {
    expect(formatDueTime("00:00")).toBe("12:00 AM");
    expect(formatDueTime("12:00")).toBe("12:00 PM");
  });
});
