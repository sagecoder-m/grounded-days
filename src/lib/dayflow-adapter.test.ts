import { describe, expect, it } from "vitest";

import { taskToDayFlowEvent } from "./dayflow-adapter";
import type { Task } from "./store-types";

function task(over: Partial<Task> = {}): Task & { date: string } {
  return {
    id: "t1",
    title: "Problem Set 3",
    area: "education",
    done: false,
    date: "2026-09-14",
    createdAt: 0,
    position: 0,
    ...over,
  } as Task & { date: string };
}

/**
 * A due date on a calendar answers "when". For coursework the missing half is
 * "for what" — six assignments in one week, titled "Problem Set 3" and
 * "Discussion post", are indistinguishable at a glance exactly when it matters.
 */
describe("taskToDayFlowEvent", () => {
  it("puts the course in front of the title", () => {
    expect(taskToDayFlowEvent(task(), "OPAN 6605").title).toBe("☐ OPAN 6605 · Problem Set 3");
  });

  it("leaves a task with no course exactly as it was", () => {
    expect(taskToDayFlowEvent(task()).title).toBe("☐ Problem Set 3");
  });

  it("keeps the done box first, so the course never displaces it", () => {
    // The box is how "done" survives being read in greyscale. A tag in front of
    // it would push the one glanceable thing off the left of a narrow chip.
    expect(taskToDayFlowEvent(task({ done: true }), "OPAN 6605").title).toBe(
      "☑ OPAN 6605 · Problem Set 3",
    );
  });

  it("is all-day, because a due date says which day and not which hour", () => {
    const event = taskToDayFlowEvent(task(), "OPAN 6605");
    expect(event.allDay).toBe(true);
    expect(event.calendarId).toBe("education");
  });
});
