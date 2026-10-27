import { describe, expect, it } from "vitest";
import { encodeWav, musicRenderSource } from "./export-music-audio.ts";

describe("music export audio", () => {
  it("renders offline a cycle at a time", () => {
    const source = musicRenderSource(4, 0.5, 48_000);
    expect(source).toContain("new OfflineAudioContext(2");
    expect(source).toContain("authored(0.5)");
    expect(source).toContain("context.suspend(cycle / cps)");
    expect(source).toContain("queryArc(cycle");
  });

  it("encodes stereo PCM as a readable WAV", () => {
    const left = [0, 0.5, -0.5, 1];
    const right = [0, -0.25, 0.25, 0];
    const wav = encodeWav([left, right], 48_000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(48_000);
    expect(wav.readInt16LE(44)).toBe(0);
    expect(wav.readInt16LE(46)).toBe(0);
    expect(wav.readInt16LE(48)).toBe(Math.round(0.5 * 32767));
    expect(wav.readInt16LE(50)).toBe(Math.round(-0.25 * 32767));
  });
});
