import { describe, expect, it } from "vitest";

import { formatTime } from "./time-field";

/**
 * The 12-hour clock's two awkward hours are noon and midnight, and both are
 * exactly the hours coursework deadlines land on. "11:59 PM" rendered as
 * "11:59 AM" is twelve hours wrong in the direction that makes something late.
 */
describe("formatTime", () => {
  it("renders the deadline hour people actually type", () => {
    expect(formatTime("23:59")).toBe("11:59 PM");
  });

  it("calls midnight 12 AM, not 0 AM", () => {
    // hours % 12 is 0 here, which a naive conversion prints as "0:00".
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("calls noon 12 PM, not 0 PM", () => {
    expect(formatTime("12:00")).toBe("12:00 PM");
  });

  it("keeps morning and afternoon apart", () => {
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("13:30")).toBe("1:30 PM");
  });

  it("renders nothing rather than nonsense for an unusable value", () => {
    // Better a missing time than "Invalid Date" in the middle of a task row.
    expect(formatTime(undefined)).toBeNull();
    expect(formatTime("")).toBeNull();
    expect(formatTime("11:59pm")).toBeNull();
    expect(formatTime("25:00")).toBeNull();
    expect(formatTime("9:5")).toBeNull();
  });
});
