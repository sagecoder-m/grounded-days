import { describe, expect, it } from "vitest";

import { WIDGETS, mobileRank } from "./widget-registry";

/**
 * The phone gets one column, so something has to decide the order. These are
 * the properties that order has to keep — the reason it exists is that the
 * saved board position gave the wrong answer.
 */
describe("mobile ordering", () => {
  const order = (keys: string[]) => [...keys].sort((a, b) => mobileRank(a) - mobileRank(b));

  it("puts the day's own list above the analysis charts", () => {
    // The default board, in the order a phone used to receive it: the two
    // charts sit left of the day list on a wide screen, so they arrived first.
    const sorted = order(["balance", "focus", "day", "river", "upcoming", "greeting"]);
    expect(sorted.indexOf("day")).toBeLessThan(sorted.indexOf("balance"));
    expect(sorted.indexOf("day")).toBeLessThan(sorted.indexOf("river"));
    expect(sorted.indexOf("upcoming")).toBeLessThan(sorted.indexOf("balance"));
  });

  it("keeps the greeting first — it is the page heading here too", () => {
    expect(order(["river", "day", "greeting", "focus"])[0]).toBe("greeting");
  });

  it("puts every tool above every chart", () => {
    const tools = ["day", "upcoming", "agenda", "focus"];
    const charts = ["chart", "river", "rhythm", "balance", "movement"];
    const worstTool = Math.max(...tools.map(mobileRank));
    const bestChart = Math.min(...charts.map(mobileRank));
    expect(worstTool).toBeLessThan(bestChart);
  });

  it("gives every widget a rank, so none can silently sort last", () => {
    for (const w of WIDGETS) {
      expect(typeof w.mobileRank).toBe("number");
      expect(mobileRank(w.key)).toBe(w.mobileRank);
    }
  });

  it("ranks are distinct, so the order is not left to sort stability", () => {
    const ranks = WIDGETS.map((w) => w.mobileRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});
