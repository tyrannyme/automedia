import { describe, expect, it } from "vitest";
import { peaksFromChannels, waveBars } from "./waveform.ts";

describe("waveform peaks", () => {
  it("keeps the loudest sample per bin across channels", () => {
    const left = new Float32Array([0.1, -0.5, 0.2, 0.05]);
    const right = new Float32Array([0.3, 0.1, -0.9, 0]);
    expect([...peaksFromChannels([left, right], 4, 2)]).toEqual([
      expect.closeTo(0.5),
      expect.closeTo(0.9),
    ]);
  });

  it("is empty for silence-free input with no samples", () => {
    expect(peaksFromChannels([], 44_100).length).toBe(0);
  });
});

describe("wave bars", () => {
  const peaks = new Float32Array([0.2, 0.4, 0.8, 0.1]);

  it("normalises to the loudest moment of the file", () => {
    expect(waveBars(peaks, 1, 0, 4, 4)).toEqual([0.25, 0.5, 1, 0.125]);
  });

  it("covers only the trimmed media range", () => {
    expect(waveBars(peaks, 1, 2, 4, 2)).toEqual([1, 0.125]);
  });

  it("returns nothing for an empty range", () => {
    expect(waveBars(peaks, 1, 2, 2, 4)).toEqual([]);
  });
});
