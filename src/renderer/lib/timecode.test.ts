import { describe, expect, it } from "vitest";
import { formatFrameIndex, formatLengthSeconds, formatTimecode } from "./timecode.ts";

describe("timecode", () => {
  it("formats current time and composition length", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00:00");
    expect(formatTimecode(2, 30)).toBe("00:00:02:00");
    expect(formatTimecode(8.308, 30)).toBe("00:00:08:09");
  });

  it("shows the playhead against the total frame count", () => {
    expect(formatFrameIndex(0, 30, 2)).toBe("0 / 60");
    expect(formatFrameIndex(2, 30, 2)).toBe("59 / 60");
  });

  it("prints composition length in seconds", () => {
    expect(formatLengthSeconds(2)).toBe("2s");
    expect(formatLengthSeconds(8.308)).toBe("8.31s");
  });
});
