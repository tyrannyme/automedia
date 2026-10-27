import { describe, expect, it } from "vitest";
import { fitTabs, TAB_SIZES } from "./tabs.ts";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("titlebar tabs", () => {
  it("shows every tab when they fit at their floor", () => {
    expect(fitTabs(ids.slice(0, 3), "b", 1000)).toEqual({ visible: ["a", "b", "c"], hidden: [] });
  });

  it("folds the rightmost tabs into the overflow menu", () => {
    const available =
      TAB_SIZES.plus + TAB_SIZES.overflow + TAB_SIZES.gap + 3 * (TAB_SIZES.floor + TAB_SIZES.gap);
    const fit = fitTabs(ids, null, available);
    expect(fit.visible).toEqual(["a", "b", "c"]);
    expect(fit.hidden).toEqual(["d", "e", "f", "g", "h"]);
  });

  it("keeps the active tab visible in the last slot when it would fold", () => {
    const available =
      TAB_SIZES.plus +
      TAB_SIZES.overflow +
      TAB_SIZES.gap +
      2 * (TAB_SIZES.floor + TAB_SIZES.gap) +
      TAB_SIZES.activeFloor +
      TAB_SIZES.gap;
    const fit = fitTabs(ids, "g", available);
    expect(fit.visible).toEqual(["a", "b", "g"]);
    expect(fit.hidden).toEqual(["c", "d", "e", "f", "h"]);
  });

  it("fits more tabs as posters in a compact window", () => {
    expect(fitTabs(ids, "a", 480, { compact: true }).hidden).toEqual([]);
    expect(fitTabs(ids, "a", 480).hidden.length).toBeGreaterThan(0);
  });
});
