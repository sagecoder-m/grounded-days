import { describe, expect, it } from "vitest";

import { courseForEvent, courseTag } from "./course-match";
import type { Course } from "./store-types";

function course(over: Partial<Course>): Course {
  return { id: "c1", name: "A Course", position: 0, createdAt: 0, ...over };
}

const OPAN6607 = course({
  id: "a",
  code: "OPAN 6607",
  name: "Programming II: Data Infrastructure",
});
const OPAN660 = course({ id: "b", code: "OPAN 660", name: "Foundations" });
const MGMT6605 = course({ id: "c", code: "MGMT 6605", name: "Operations Analytics" });
const NOCODE = course({ id: "d", name: "Statistics", code: undefined });

describe("courseForEvent", () => {
  it("finds the course from a code in a synced lecture title", () => {
    // The real shape of these: a university's own calendar entry.
    const title = "Programming II: Data Infrastructure (OPAN 6607)";
    expect(courseForEvent(title, [OPAN6607, MGMT6605])?.id).toBe("a");
  });

  it("ignores case and punctuation, the way people write codes", () => {
    for (const title of ["opan6607 lecture", "Lecture — OPAN-6607", "opan 6607"]) {
      expect(courseForEvent(title, [OPAN6607])?.id).toBe("a");
    }
  });

  it("prefers the longer code, so a prefix cannot steal the match", () => {
    // "OPAN 660" is a prefix of "OPAN 6607". Shortest-first would tag an
    // OPAN 6607 lecture as OPAN 660 — the same class, filed under the wrong
    // course, every week.
    expect(courseForEvent("Lab for OPAN 6607", [OPAN660, OPAN6607])?.id).toBe("a");
  });

  it("keeps courses that share digits apart", () => {
    expect(courseForEvent("MGMT 6605 seminar", [MGMT6605, OPAN6607])?.id).toBe("c");
  });

  it("falls back to a full course name when there is no code", () => {
    expect(courseForEvent("Statistics tutorial", [NOCODE])?.id).toBe("d");
  });

  it("returns nothing rather than guessing", () => {
    // A wrongly-tagged lecture tells you something false about your day, which
    // is worse than an untagged one telling you nothing.
    expect(courseForEvent("Dentist", [OPAN6607, MGMT6605])).toBeNull();
    expect(courseForEvent("", [OPAN6607])).toBeNull();
    expect(courseForEvent("Team standup", [])).toBeNull();
  });

  it("does not match on a fragment of a course name", () => {
    // "Programming" alone appears in plenty of unrelated entries.
    expect(courseForEvent("Programming club social", [OPAN6607])).toBeNull();
  });

  it("ignores a course whose name is too short to be distinctive", () => {
    const lab = course({ id: "e", name: "Lab", code: undefined });
    expect(courseForEvent("Collaborative Lab Meeting", [lab])).toBeNull();
  });
});

describe("courseTag", () => {
  it("shows the code when there is one", () => {
    expect(courseTag(OPAN6607)).toBe("OPAN 6607");
  });

  it("falls back to the name, so a course always says what it is", () => {
    expect(courseTag(NOCODE)).toBe("Statistics");
  });
});
