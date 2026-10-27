import { describe, expect, it } from "vitest";
import {
  clampClipDuration,
  clampInspectorNumber,
  finiteNumber,
  formatClipTime,
  formatInspectorNumber,
  minimumClipDuration,
  parseClipTime,
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

  it("formats and reads clip times as m:ss.hh", () => {
    expect(formatClipTime(0)).toBe("0:00.00");
    expect(formatClipTime(4)).toBe("0:04.00");
    expect(formatClipTime(65.5)).toBe("1:05.50");
    expect(formatClipTime(59.999)).toBe("1:00.00");
    expect(parseClipTime("0:04.00")).toBe(4);
    expect(parseClipTime("1:05.5")).toBe(65.5);
    expect(parseClipTime(" 2.25 ")).toBe(2.25);
    expect(parseClipTime("1:75")).toBeNull();
    expect(parseClipTime("soon")).toBeNull();
    expect(parseClipTime("")).toBeNull();
  });
});
