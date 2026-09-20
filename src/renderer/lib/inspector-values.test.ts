import { describe, expect, it } from "vitest";
import {
  clampClipDuration,
  clampInspectorNumber,
  finiteNumber,
  formatInspectorNumber,
  minimumClipDuration,
} from "./inspector-values.ts";

describe("inspector numeric values", () => {
  it("falls back for non-finite input and clamps bounds", () => {
    expect(finiteNumber("not-a-number", 4)).toBe(4);
    expect(clampInspectorNumber("-1", 4, 0, 10)).toBe(0);
    expect(clampInspectorNumber("12", 4, 0, 10)).toBe(10);
  });

  it("uses one composition frame as the minimum clip duration", () => {
    expect(minimumClipDuration(30)).toBeCloseTo(1 / 30);
    expect(clampClipDuration("-1", 3, 30, 10)).toBeCloseTo(1 / 30);
    expect(clampClipDuration("0", 3, 60, 10)).toBeCloseTo(1 / 60);
  });

  it("keeps inspector values readable", () => {
    expect(formatInspectorNumber(3)).toBe("3");
    expect(formatInspectorNumber(1 / 30)).toBe("0.033");
    expect(formatInspectorNumber(0.017000000923871994)).toBe("0.017");
  });
});
