import { describe, expect, it } from "vitest";

import { analyseFeatureAdoption, THIN_EVIDENCE, type UsageFact } from "./hq-analytics";

const NOW = Date.parse("2026-08-30T12:00:00Z");
const day = 86_400_000;

/** n events of `event` by `user`, all inside the window. */
function facts(user: string, event: string, n: number, daysAgo = 1): UsageFact[] {
  return Array.from({ length: n }, () => ({
    user_id: user,
    event,
    created_at: new Date(NOW - daysAgo * day).toISOString(),
  }));
}

const find = (rows: ReturnType<typeof analyseFeatureAdoption>["rows"], label: string) =>
  rows.find((r) => r.label === label)!;

describe("analyseFeatureAdoption", () => {
  it("counts distinct people, not events", () => {
    // One obsessive user vs four casual ones, same total volume.
    const events = [
      ...facts("solo", "focus_session", 40),
      ...facts("a", "task_add", 10),
      ...facts("b", "task_add", 10),
      ...facts("c", "task_add", 10),
      ...facts("d", "task_add", 10),
    ];
    const { rows, activeUsers } = analyseFeatureAdoption(events, 30, NOW);
    expect(activeUsers).toBe(5);
    expect(find(rows, "Focus timer").users).toBe(1);
    expect(find(rows, "Tasks").users).toBe(4);
    // Same volume, opposite adoption — and Tasks must rank above the timer.
    expect(find(rows, "Focus timer").uses).toBe(40);
    expect(find(rows, "Tasks").uses).toBe(40);
    expect(rows.findIndex((r) => r.label === "Tasks")).toBeLessThan(
      rows.findIndex((r) => r.label === "Focus timer"),
    );
  });

  it("calls thin evidence rather than guessing", () => {
    const events = [
      ...facts("a", "journal_entry_add", THIN_EVIDENCE - 1),
      ...facts("a", "task_add", 20),
    ];
    const { rows } = analyseFeatureAdoption(events, 30, NOW);
    expect(find(rows, "Journal").verdict).toBe("thin");
    expect(find(rows, "Journal").because).toContain("Too little to call");
  });

  it("says nobody touched an unused feature without calling it cut", () => {
    const { rows } = analyseFeatureAdoption(facts("a", "task_add", 20), 30, NOW);
    const sharing = find(rows, "Sharing");
    expect(sharing.uses).toBe(0);
    expect(sharing.verdict).toBe("thin");
    expect(sharing.because).toContain("Nobody has touched it");
  });

  it("recommends deepening what is wide and repeated", () => {
    const events = ["a", "b", "c", "d"].flatMap((u) => facts(u, "task_add", 8));
    const { rows } = analyseFeatureAdoption(events, 30, NOW);
    expect(find(rows, "Tasks").verdict).toBe("deepen");
  });

  it("separates niche from shallow by how many people tried it", () => {
    // 10 active users. Journal: 1 user, many uses. Goals: 1 user, tried once.
    const others = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"].flatMap((u) =>
      facts(u, "task_add", 3),
    );
    const events = [
      ...others,
      ...facts("loyal", "journal_entry_add", 12),
      ...facts("tourist", "goal_add", 1),
      ...facts("tourist2", "goal_add", 1),
      ...facts("tourist3", "goal_add", 1),
      ...facts("tourist4", "goal_add", 1),
      ...facts("tourist5", "goal_add", 1),
      ...facts("tourist6", "goal_add", 1),
    ];
    const { rows } = analyseFeatureAdoption(events, 30, NOW);
    // One devoted user: narrow but real.
    expect(find(rows, "Journal").verdict).toBe("niche");
    // Six people tried Goals once each and none came back — broad interest,
    // no hold. Not "keep", and not "cut" either.
    expect(find(rows, "Goals").verdict).toBe("shallow");
  });

  it("calls it cut only when almost nobody tried it and they did not return", () => {
    const others = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"].flatMap((u) =>
      facts(u, "task_add", 5),
    );
    const events = [...others, ...facts("x1", "goal_add", 3), ...facts("x2", "goal_add", 3)];
    const { rows } = analyseFeatureAdoption(events, 30, NOW);
    // 2 of 11 active users, 3 uses each... came back, so niche not cut.
    expect(find(rows, "Goals").verdict).toBe("niche");
  });

  it("ignores events outside the window", () => {
    const events = [...facts("a", "task_add", 20, 90), ...facts("b", "habit_add", 10, 2)];
    const { rows, activeUsers } = analyseFeatureAdoption(events, 30, NOW);
    expect(activeUsers).toBe(1);
    expect(find(rows, "Tasks").uses).toBe(0);
    expect(find(rows, "Habits").uses).toBe(10);
  });
});
