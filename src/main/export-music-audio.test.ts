import { describe, expect, it } from "vitest";
import { encodeWav, musicAudioTapSource, pcmIsAudible } from "./export-music-audio.ts";

describe("music export audio", () => {
  it("installs a destination tap before Strudel can create an AudioContext", () => {
    expect(musicAudioTapSource).toContain("AudioNode.prototype.connect");
    expect(musicAudioTapSource).toContain("createScriptProcessor");
    expect(musicAudioTapSource).toContain("globalThis.__automediaMusicTap");
    expect(musicAudioTapSource).toContain("wavBase64");
    expect(musicAudioTapSource).toContain("OfflineAudioContext");
    expect(musicAudioTapSource.indexOf("taps.set(ctx, tap)")).toBeLessThan(
      musicAudioTapSource.indexOf("processor.connect(silent)"),
    );
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

  it("treats near-silent captures as inaudible", () => {
    expect(
      pcmIsAudible({
        sampleRate: 48_000,
        peak: 0,
        samples: 8,
        wavBase64: "",
      }),
    ).toBe(false);
    expect(
      pcmIsAudible({
        sampleRate: 48_000,
        peak: 0.2,
        samples: 8,
        wavBase64: "UklGRg==",
      }),
    ).toBe(true);
  });
});
