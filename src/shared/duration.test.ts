import { describe, expect, it } from "vitest";
import { contentDuration } from "./duration.ts";

describe("contentDuration", () => {
  it("uses the last clip out point", () => {
    expect(contentDuration([{ start: 1, duration: 1 }])).toBe(2);
    expect(contentDuration([{ start: 4, duration: 1 }])).toBe(5);
    expect(
      contentDuration([
        { start: 0, duration: 1 },
        { start: 2, duration: 3 },
      ]),
    ).toBe(5);
  });

  it("falls back to three seconds when the timeline is empty", () => {
    expect(contentDuration([])).toBe(3);
  });
});
