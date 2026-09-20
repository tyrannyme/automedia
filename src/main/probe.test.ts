import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrameRate, probeFile } from "./probe.ts";

describe("probeFile", () => {
  it("returns codec, dimensions, duration, and frame rate for video streams", async () => {
    const result = await probeFile(path.resolve("fixtures/fps-guns.mp4"));
    expect(result.streams[0]).toMatchObject({
      codecType: "video",
      codecName: "h264",
      durationSeconds: 2.48,
      width: 960,
      height: 540,
      fps: 25,
    });
  });

  it("falls back to average frame rate when the primary rate is unusable", () => {
    expect(parseFrameRate("0/0", "30000/1001")).toBeCloseTo(29.97003, 5);
    expect(parseFrameRate("not-a-rate", 24)).toBe(24);
  });
});
