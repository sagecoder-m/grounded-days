import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TaskRow } from "./task-row";
import type { Task } from "@/lib/store-types";

afterEach(cleanup);

const base: Task = {
  id: "t1",
  area: "education",
  title: "Assignment 1 (individual)",
  done: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const long =
  "Read chapters 4 to 9, then write a two page reflection on the case study and bring it to the seminar.";

/**
 * The description toggle, which exists because a syllabus import can put a
 * paragraph on every assignment and turn a list you scan into a page you read.
 */
describe("TaskRow description", () => {
  it("offers no toggle when there is nothing behind it", () => {
    render(<TaskRow task={base} />);
    expect(screen.queryByText("Details")).toBeNull();
    // The way to add one is still there, unchanged.
    expect(screen.getByText("Add a description…")).toBeTruthy();
  });

  it("collapses to a preview and expands on the toggle", () => {
    render(<TaskRow task={{ ...base, description: long }} />);
    expect(screen.getByTitle("Show the full description")).toBeTruthy();

    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("Hide details")).toBeTruthy();
    expect(screen.queryByTitle("Show the full description")).toBeNull();

    fireEvent.click(screen.getByText("Hide details"));
    expect(screen.getByTitle("Show the full description")).toBeTruthy();
  });

  it("expands when the preview line itself is clicked", () => {
    render(<TaskRow task={{ ...base, description: long }} />);
    fireEvent.click(screen.getByTitle("Show the full description"));
    expect(screen.getByText("Hide details")).toBeTruthy();
  });

  it("treats whitespace as no description", () => {
    render(<TaskRow task={{ ...base, description: "   " }} />);
    expect(screen.queryByText("Details")).toBeNull();
  });
});
