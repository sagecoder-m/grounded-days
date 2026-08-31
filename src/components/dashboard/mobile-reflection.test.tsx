import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { MobileReflection } from "./mobile-reflection";

afterEach(cleanup);

/**
 * The phone's charts drawer. What matters here is the closed state: a pilot
 * user found the mobile board overwhelming, and this is the change that answers
 * that, so "closed on arrival" and "does not render its contents until asked"
 * are the behaviours worth defending against a later well-meaning tidy-up.
 */
describe("MobileReflection", () => {
  it("starts closed, and does not mount what it is hiding", () => {
    render(
      <MobileReflection labels={["Your rhythm", "Where your attention went"]}>
        <div>a chart</div>
      </MobileReflection>,
    );

    // Not merely hidden: these widgets measure themselves and read the whole
    // event history to draw. Rendering them into a closed container would make
    // every phone pay for the work this exists to defer.
    expect(screen.queryByText("a chart")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("names what is inside, so it reads as a drawer and not a missing feature", () => {
    render(
      <MobileReflection labels={["Your rhythm", "Where your attention went"]}>
        <div>a chart</div>
      </MobileReflection>,
    );

    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Looking back");
    expect(button.textContent).toContain("Your rhythm");
    expect(button.textContent).toContain("Where your attention went");
  });

  it("opens on a tap", () => {
    render(
      <MobileReflection labels={["Your rhythm"]}>
        <div>a chart</div>
      </MobileReflection>,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("a chart")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });
});
