import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Composition } from "@shared/schemas.ts";
import { encodeAudioFile, openVideoWriter } from "./export-capture.ts";
import { mixSampleRate, type Pcm } from "./export-audio.ts";
import { verifyAudio, verifyVideo } from "./export-verify.ts";
import { decodeRgba, pixel } from "./rgba.ts";
import { ALL_FORMATS, AudioSampleSink, FilePathSource, Input } from "./mediabunny.ts";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "automedia-verify-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const width = 64;
const height = 48;
const fps = 10;
const durationSeconds = 1;

// SAFETY: verification reads only size, frame rate, and duration from the composition.
const composition = { width, height, fps, durationSeconds } as Composition;

function tone(seconds: number): Pcm {
  const plane = Float32Array.from(
    { length: Math.round(seconds * mixSampleRate) },
    (_, index) => Math.sin((2 * Math.PI * 440 * index) / mixSampleRate) * 0.4,
  );
  return [plane, plane.slice()];
}

async function writeVideo(format: "mp4" | "webm", withAudio: boolean): Promise<string> {
  const filePath = path.join(dir, `${format}-${withAudio ? "av" : "v"}.${format}`);
  const writer = await openVideoWriter(
    filePath,
    format,
    composition,
    80,
    withAudio ? tone(durationSeconds) : undefined,
  );
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set([200, 40, 90, 255], index * 4);
  for (let frame = 0; frame < fps * durationSeconds; frame += 1) {
    await writer.addFrame(frame, { width, height, data });
  }
  await writer.finish();
  return filePath;
}

describe("video export encoding and verification", () => {
  it.each([
    ["mp4", false],
    ["mp4", true],
    ["webm", false],
    ["webm", true],
  ] as const)("writes a verifiable %s (audio: %s)", async (format, withAudio) => {
    const filePath = await writeVideo(format, withAudio);
    await expect(verifyVideo(filePath, composition, withAudio, format)).resolves.toBeUndefined();
    const color = pixel(await decodeRgba(filePath), width, 32, 24);
    expect(Math.abs(color[0] - 200)).toBeLessThanOrEqual(4);
    expect(Math.abs(color[1] - 40)).toBeLessThanOrEqual(4);
    expect(Math.abs(color[2] - 90)).toBeLessThanOrEqual(4);
  });

  it("rejects mismatched container, size, frame rate, audio, and duration", async () => {
    const filePath = await writeVideo("mp4", false);
    await expect(verifyVideo(filePath, composition, false, "webm")).rejects.toThrow(
      "export container is not webm",
    );
    await expect(verifyVideo(filePath, { ...composition, width: 66 }, false)).rejects.toThrow(
      "dimensions",
    );
    await expect(verifyVideo(filePath, { ...composition, fps: 24 }, false)).rejects.toThrow(
      "frame rate",
    );
    await expect(verifyVideo(filePath, composition, true)).rejects.toThrow("missing audio");
    await expect(
      verifyVideo(filePath, { ...composition, durationSeconds: 2 }, false),
    ).rejects.toThrow("duration");
  });
});

/** Decodes the left channel between 0.2s and 0.8s and measures its tone. */
async function decodedTone(filePath: string): Promise<{ hz: number; peak: number }> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("no audio track");
  let crossings = 0;
  let previous = 0;
  let frames = 0;
  let peak = 0;
  for await (const sample of new AudioSampleSink(track).samples(0.2, 0.8)) {
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
    sample.close();
    for (const value of plane) {
      if (previous < 0 && value >= 0) crossings += 1;
      previous = value;
      peak = Math.max(peak, Math.abs(value));
    }
    frames += plane.length;
  }
  return { hz: crossings / (frames / track.sampleRate), peak };
}

/** Silence, then a tone from `onsetSeconds`. */
function toneFrom(onsetSeconds: number, seconds: number): Pcm {
  const onset = Math.round(onsetSeconds * mixSampleRate);
  const plane = Float32Array.from({ length: Math.round(seconds * mixSampleRate) }, (_, index) =>
    index < onset ? 0 : Math.sin((2 * Math.PI * 440 * (index - onset)) / mixSampleRate) * 0.4,
  );
  return [plane, plane.slice()];
}

/** Seconds until the decoded left channel first gets loud. */
async function decodedOnset(filePath: string): Promise<number> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("no audio track");
  for await (const sample of new AudioSampleSink(track).samples()) {
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
    sample.close();
    const index = plane.findIndex((value) => Math.abs(value) > 0.1);
    if (index >= 0) return sample.timestamp + index / sample.sampleRate;
  }
  return Number.NaN;
}

describe("audio export encoding and verification", () => {
  it("starts MP4 and WebM audio on time despite encoder priming", async () => {
    for (const format of ["mp4", "webm"] as const) {
      const filePath = path.join(dir, `onset.${format}`);
      const writer = await openVideoWriter(filePath, format, composition, 80, toneFrom(0.5, 1));
      const data = new Uint8Array(width * height * 4).fill(255);
      for (let frame = 0; frame < fps; frame += 1) {
        await writer.addFrame(frame, { width, height, data });
      }
      await writer.finish();
      expect(Math.abs((await decodedOnset(filePath)) - 0.5), format).toBeLessThan(0.003);
    }
  });

  it("starts Ogg and WAV audio on time", async () => {
    for (const format of ["ogg", "wav"] as const) {
      const filePath = path.join(dir, `onset.${format}`);
      await encodeAudioFile(toneFrom(0.5, 1), format, filePath);
      expect(Math.abs((await decodedOnset(filePath)) - 0.5), format).toBeLessThan(0.003);
    }
  });

  it.each(["mp4", "webm"] as const)("keeps the %s audio signal intact", async (format) => {
    const decoded = await decodedTone(await writeVideo(format, true));
    expect(Math.abs(decoded.hz - 440)).toBeLessThan(10);
    expect(Math.abs(decoded.peak - 0.4)).toBeLessThan(0.1);
  });

  it.each(["mp3", "wav", "ogg"] as const)("keeps the %s signal intact", async (format) => {
    const filePath = path.join(dir, `signal.${format}`);
    await encodeAudioFile(tone(durationSeconds), format, filePath, 80);
    const decoded = await decodedTone(filePath);
    expect(Math.abs(decoded.hz - 440)).toBeLessThan(10);
    expect(Math.abs(decoded.peak - 0.4)).toBeLessThan(0.1);
  });

  it.each(["mp3", "wav", "ogg"] as const)("writes a verifiable %s", async (format) => {
    const filePath = path.join(dir, `tone.${format}`);
    await encodeAudioFile(tone(durationSeconds), format, filePath, 80);
    await expect(verifyAudio(filePath, composition, format)).resolves.toBeUndefined();
    await expect(
      verifyAudio(filePath, { ...composition, durationSeconds: 3 }, format),
    ).rejects.toThrow("duration");
  });

  it("rejects the wrong audio container", async () => {
    const filePath = path.join(dir, "wrong.wav");
    await encodeAudioFile(tone(durationSeconds), "wav", filePath);
    await expect(verifyAudio(filePath, composition, "ogg")).rejects.toThrow(
      "export container is not ogg",
    );
  });
});
