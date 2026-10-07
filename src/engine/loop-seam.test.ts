import { describe, expect, it } from "vitest";
import { loopSeamTimes, pngsMatch } from "./loop-seam.ts";

describe("loop seam", () => {
  it("compares frame zero to the last displayed frame", () => {
    expect(loopSeamTimes(30, 2)).toEqual({
      first: { timeSeconds: 0, frame: 0 },
      last: { timeSeconds: 59 / 30, frame: 59 },
    });
    expect(loopSeamTimes(24, 1 / 24)).toEqual({
      first: { timeSeconds: 0, frame: 0 },
      last: { timeSeconds: 0, frame: 0 },
    });
  });

  it("treats identical PNG bytes as a closed loop", () => {
    const frame = Uint8Array.from([1, 2, 3, 4]);
    expect(pngsMatch(frame, frame)).toBe(true);
    expect(pngsMatch(frame, Uint8Array.from([1, 2, 3, 5]))).toBe(false);
    expect(pngsMatch(frame, Uint8Array.from([1, 2, 3]))).toBe(false);
  });
});
