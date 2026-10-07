import { describe, expect, it } from "vitest";
import {
  audioEncoding,
  mixSampleRate,
  mixTimeline,
  musicClip,
  timeStretch,
  type AudioClip,
  type Pcm,
} from "./export-audio.ts";
import { encodeWav } from "./export-music-audio.ts";
import { BufferSource } from "./mediabunny.ts";

const rate = mixSampleRate;

/** A mono WAV whose sample value encodes the source time: 0.1 per second. */
function rampWav(seconds: number): Buffer {
  const samples = Array.from({ length: Math.round(seconds * rate) }, (_, index) => {
    return (index / rate) * 0.1;
  });
  return encodeWav([samples], rate);
}

function toneWav(seconds: number, hz: number, amplitude = 0.5): Buffer {
  const samples = Array.from({ length: Math.round(seconds * rate) }, (_, index) => {
    return amplitude * Math.sin((2 * Math.PI * hz * index) / rate);
  });
  return encodeWav([samples, samples], rate);
}

function clip(wav: Buffer, placement: Omit<AudioClip, "source">): AudioClip {
  return { source: new BufferSource(wav), ...placement };
}

function at(pcm: Pcm, seconds: number, channel = 0): number {
  return pcm[channel]?.[Math.round(seconds * rate)] ?? Number.NaN;
}

/** Estimates frequency from rising zero crossings. */
function frequency(samples: Float32Array): number {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1] ?? 0) < 0 && (samples[index] ?? 0) >= 0) crossings += 1;
  }
  return crossings / (samples.length / rate);
}

describe("mixTimeline", () => {
  it("trims, offsets, gains, and pads a clip to the composition length", async () => {
    const pcm = await mixTimeline(3, [
      clip(rampWav(4), { trimStart: 1, duration: 1.5, rate: 1, volume: 0.5, start: 0.5 }),
    ]);
    expect(pcm).toHaveLength(2);
    expect(pcm[0]).toHaveLength(3 * rate);
    expect(at(pcm, 0.25)).toBe(0);
    // Timeline 1.0s is 0.5s into the clip, so source 1.5s, at half volume.
    expect(at(pcm, 1)).toBeCloseTo(0.15 * 0.5, 2);
    expect(at(pcm, 1, 1)).toBeCloseTo(0.15 * 0.5, 2);
    expect(at(pcm, 1.9)).toBeCloseTo(0.24 * 0.5, 2);
    // The clip ends at 2.0s; the rest is silence.
    expect(at(pcm, 2.25)).toBe(0);
    expect(at(pcm, 2.99)).toBe(0);
  });

  it("cuts clips that run past the composition end", async () => {
    const pcm = await mixTimeline(1, [
      clip(rampWav(3), { trimStart: 0, duration: 3, rate: 1, volume: 1, start: 0.5 }),
    ]);
    expect(pcm[0]).toHaveLength(rate);
    expect(at(pcm, 0.9)).toBeCloseTo(0.04, 2);
  });

  it("averages several clips like amix", async () => {
    const pcm = await mixTimeline(1, [
      clip(toneWav(1, 0, 0), { trimStart: 0, duration: 1, rate: 1, volume: 1, start: 0 }),
      clip(rampWav(1), { trimStart: 0, duration: 1, rate: 1, volume: 1, start: 0 }),
    ]);
    expect(at(pcm, 0.5)).toBeCloseTo(0.05 / 2, 2);
  });

  it("time-stretches rate changes over the clip's timeline duration", async () => {
    const pcm = await mixTimeline(2, [
      clip(toneWav(2, 440), { trimStart: 0, duration: 1, rate: 2, volume: 1, start: 0 }),
    ]);
    const played = pcm[0]?.subarray(0, rate) ?? new Float32Array();
    expect(Math.abs(frequency(played) - 440)).toBeLessThan(15);
    expect(at(pcm, 1.5)).toBe(0);
  });

  it("resamples sources to the mix rate and plays music from zero", async () => {
    const samples = Array.from({ length: 11_025 }, () => 0.25);
    const pcm = await mixTimeline(1, [musicClip(encodeWav([samples], 22_050), 1)]);
    expect(at(pcm, 0.25)).toBeCloseTo(0.25, 2);
    expect(at(pcm, 0.75)).toBe(0);
  });

  it("stops when canceled", async () => {
    await expect(
      mixTimeline(
        1,
        [clip(rampWav(1), { trimStart: 0, duration: 1, rate: 1, volume: 1, start: 0 })],
        () => true,
      ),
    ).rejects.toMatchObject({ code: "canceled" });
  });
});

describe("timeStretch", () => {
  it("changes duration by 1 / rate and keeps pitch", () => {
    const tone = Float32Array.from({ length: rate }, (_, index) =>
      Math.sin((2 * Math.PI * 330 * index) / rate),
    );
    for (const playbackRate of [0.25, 0.5, 1.5, 4]) {
      const [stretched] = timeStretch([tone], playbackRate);
      expect(stretched).toHaveLength(Math.round(rate / playbackRate));
      expect(Math.abs(frequency(stretched ?? new Float32Array()) - 330)).toBeLessThan(10);
    }
  });

  it("returns the input untouched at unity rate", () => {
    const pcm = [new Float32Array([0.1, 0.2])];
    expect(timeStretch(pcm, 1)).toBe(pcm);
  });
});

describe("audioEncoding", () => {
  it("keeps the previous codec and bitrate choices", () => {
    expect(audioEncoding("mp4")).toEqual({ codec: "aac", rate: { bitrate: 192_000 } });
    expect(audioEncoding("webm")).toEqual({ codec: "opus", rate: { bitrate: 160_000 } });
    expect(audioEncoding("mp3", 1)).toEqual({ codec: "mp3", rate: { bitrate: 64_000 } });
    expect(audioEncoding("mp3", 100).rate?.bitrate).toBe(320_000);
    expect(audioEncoding("ogg", 80).codec).toBe("vorbis");
    expect(audioEncoding("wav")).toEqual({ codec: "pcm-s16" });
  });
});
