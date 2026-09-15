import { describe, expect, it } from "vitest";
import type { Layout, LayoutItem } from "react-grid-layout";

import { COMPACTOR, fromLayout } from "./layout-engine";
import type { WidgetPlacement } from "@/lib/store-types";

/** A minimal LayoutItem, filling in the fields a test doesn't care about. */
function item(
  partial: Pick<LayoutItem, "i" | "x" | "y" | "w" | "h"> & { static?: boolean },
): LayoutItem {
  return { minW: 1, minH: 1, ...partial };
}

/**
 * This board's compaction has been on, briefly off, and is on again — twice
 * now for reasons that turned out to be wrong. See the comment on COMPACTOR
 * in layout-engine.ts for the full history. These tests exist so the next
 * change to this file has something firmer than a comment to fail against.
 */
describe("COMPACTOR", () => {
  it("pulls a tile up to close a gap left above it", () => {
    const layout: Layout = [item({ i: "a", x: 0, y: 5, w: 12, h: 6 })];
    const [a] = COMPACTOR.compact(layout, 36);
    expect(a?.y).toBe(0);
  });

  it("stacks two tiles in the same column rather than letting them overlap", () => {
    const layout: Layout = [
      item({ i: "a", x: 0, y: 0, w: 12, h: 6 }),
      item({ i: "b", x: 0, y: 2, w: 12, h: 6 }),
    ];
    const [a, b] = COMPACTOR.compact(layout, 36);
    expect(a?.y).toBe(0);
    expect(b?.y).toBe(6);
  });

  it("never moves a static tile, and compacts the rest around it", () => {
    const layout: Layout = [
      item({ i: "greeting", x: 0, y: 3, w: 36, h: 5, static: true }),
      item({ i: "day", x: 0, y: 20, w: 12, h: 10 }),
    ];
    const [greeting, day] = COMPACTOR.compact(layout, 36);
    // The static tile holds its own y — compaction does not touch it.
    expect(greeting?.y).toBe(3);
    // The other tile still rises, but only as far as the static one allows.
    expect(day?.y).toBe(8);
  });
});

describe("fromLayout", () => {
  const placements: WidgetPlacement[] = [
    { key: "greeting", x: 0, y: 0, w: 36, h: 5, enabled: true },
    { key: "day", x: 0, y: 5, w: 12, h: 10, enabled: true },
  ];
  const isPinned = (key: string) => key === "greeting";

  it("ignores whatever the engine reports for a pinned key", () => {
    // A pinned tile should never move, but this asserts it even if the engine
    // somehow reported one moving — the guarantee has to hold here, not just
    // upstream, because this is the one place every gesture funnels through.
    const engineLayout: Layout = [
      item({ i: "greeting", x: 10, y: 40, w: 12, h: 12 }),
      item({ i: "day", x: 3, y: 0, w: 12, h: 10 }),
    ];
    const next = fromLayout(engineLayout, placements, isPinned);
    const greeting = next.find((p) => p.key === "greeting");
    const day = next.find((p) => p.key === "day");
    expect(greeting).toMatchObject({ x: 0, y: 0, w: 36, h: 5 });
    expect(day).toMatchObject({ x: 3, y: 0, w: 12, h: 10 });
  });
});
