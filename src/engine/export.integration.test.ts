import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaTrack } from "@shared/schemas.ts";
import { ExportQueue } from "./export.ts";
import {
  ALL_FORMATS,
  AudioSampleSink,
  FilePathSource,
  Input,
  VideoSampleSink,
} from "./mediabunny.ts";
import { startEngine, type RunningEngine } from "./engine.ts";
import { CompositionStore } from "./store.ts";
import { writeExample } from "./examples/index.ts";

const missing = existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"];
const prerequisiteMessage = missing.length > 0 ? `missing ${missing.join(", ")}` : "";

describe("export integration prerequisites", () => {
  it.skipIf(missing.length > 0)(prerequisiteMessage || "Playwright Chromium is available", () => {
    expect(missing).toEqual([]);
  });
});

const integration = describe.skipIf(missing.length > 0);

/** The centre pixel's red, green, and blue in every frame of a video. */
async function centrePixels(filePath: string): Promise<[number, number, number][]> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("no video track");
  const pixels: [number, number, number][] = [];
  for await (const sample of new VideoSampleSink(track).samples()) {
    const rgba = new Uint8Array(sample.allocationSize({ format: "RGBA" }));
    await sample.copyTo(rgba, { format: "RGBA" });
    const offset = ((sample.codedHeight >> 1) * sample.codedWidth + (sample.codedWidth >> 1)) * 4;
    pixels.push([rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0]);
    sample.close();
  }
  return pixels;
}

/** Seconds until the left channel first reaches a third of its peak. */
async function audioOnset(filePath: string): Promise<number> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("no audio track");
  const planes: Float32Array[] = [];
  for await (const sample of new AudioSampleSink(track).samples()) {
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
    sample.close();
    planes.push(plane);
  }
  const left = Float32Array.from(planes.flatMap((plane) => [...plane]));
  const peak = left.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (peak < 0.05) throw new Error("the music is silent");
  return left.findIndex((value) => Math.abs(value) >= peak / 3) / track.sampleRate;
}

async function waitForFilesGone(paths: readonly string[], timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (paths.every((filePath) => !existsSync(filePath))) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (paths.every((filePath) => !existsSync(filePath))) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for files to disappear: ${paths.join(", ")}`);
}

integration("export integration", () => {
  let root: string;
  let store: CompositionStore;
  let queue: ExportQueue;
  let engine: RunningEngine | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-export-int-"));
    engine = await startEngine(root, { port: 0 });
    store = engine.store;
    queue = engine.queue;
  });

  afterEach(async () => {
    await engine?.close();
    await rm(root, { recursive: true, force: true });
  });

  async function waitForPhase(jobId: string, phases: ReadonlySet<string>, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = queue.get(jobId);
      if (phases.has(job.phase)) {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`timed out waiting for export ${jobId} to reach ${[...phases].join(", ")}`);
  }

  it("allows PNG but rejects MP4 for an 801x601 composition", async () => {
    const composition = await store.create();
    await store.updateSettings({ compositionId: composition.id, width: 801, height: 601 });

    await expect(
      queue.start({ compositionId: composition.id, format: "mp4" }),
    ).rejects.toMatchObject({ code: "odd_dimensions" });

    const job = await queue.start({ compositionId: composition.id, format: "png" });
    const completed = await waitForPhase(job.id, new Set(["completed", "failed"]));
    expect(completed.phase).toBe("completed");
    expect(completed.contentUrl).toContain(`/exports/${job.id}`);
  }, 90_000);

  it("exports video whose frames stop changing", async () => {
    // The clock animates for 2 seconds; the last second repeats one frame.
    const composition = await writeExample(store, "css-clock");
    await store.updateSettings({ compositionId: composition.id, durationSeconds: 3 });

    const job = await queue.start({ compositionId: composition.id, format: "webm" });
    const completed = await waitForPhase(job.id, new Set(["completed", "failed"]), 60_000);
    expect(completed.error).toBeUndefined();
    expect(completed.phase).toBe("completed");
  }, 90_000);

  /** Puts `track` on the timeline for the whole composition. */
  async function fill(compositionId: string, track: MediaTrack, durationSeconds: number) {
    await store.putTrack(compositionId, { ...track, start: 0, duration: durationSeconds });
  }

  it("captures every MP4 frame at its own time while music plays", async () => {
    const durationSeconds = 1.5;
    const composition = await store.create();
    await store.updateSettings({
      compositionId: composition.id,
      width: 64,
      height: 64,
      fps: 30,
      durationSeconds,
      background: "#000000",
    });
    const block = await store.createBlock(composition.id);
    // A slow, async renderer that paints red before each frame's grey:
    // a frame captured while the seek is still working shows the red, and
    // one captured from another time shows the wrong grey.
    await store.writeFile(
      composition.id,
      `blocks/${block.asset}/style.css`,
      "utf8",
      "html, body { margin: 0; width: 100%; height: 100%; }\n",
      (await store.readFile(composition.id, `blocks/${block.asset}/style.css`)).etag,
    );
    await store.writeFile(
      composition.id,
      `blocks/${block.asset}/script.js`,
      "utf8",
      `window.automedia.registerRenderer(async ({ frame }) => {
  document.body.style.background = "rgb(255, 0, 0)";
  await new Promise((resolve) => setTimeout(resolve, 20 + (frame % 4) * 15));
  const level = frame * 5;
  document.body.style.background = "rgb(" + level + ", " + level + ", " + level + ")";
});
`,
      (await store.readFile(composition.id, `blocks/${block.asset}/script.js`)).etag,
    );
    await fill(composition.id, block, durationSeconds);
    await fill(composition.id, await store.createMusicBlock(composition.id), durationSeconds);

    const job = await queue.start({ compositionId: composition.id, format: "mp4" });
    const completed = await waitForPhase(job.id, new Set(["completed", "failed"]), 120_000);
    expect(completed.error).toBeUndefined();
    expect(completed.frames).toBe(45);
    expect(completed.frame).toBe(45);

    const pixels = await centrePixels(completed.outputPath ?? "");
    expect(pixels).toHaveLength(45);
    const wrong = pixels.flatMap(([red, green, blue], frame) =>
      [red, green, blue].every((channel) => Math.abs(channel - frame * 5) <= 3)
        ? []
        : [{ frame, pixel: [red, green, blue] }],
    );
    expect(wrong).toEqual([]);
  }, 150_000);

  it("starts rendered music on its first beat", async () => {
    const composition = await store.create();
    await store.updateSettings({ compositionId: composition.id, durationSeconds: 1 });
    const music = await store.createMusicBlock(composition.id);
    const patternPath = `music/${music.asset}/pattern.js`;
    await store.writeFile(
      composition.id,
      patternPath,
      "utf8",
      `import { note } from "@strudel/web";

export default function pattern(gain) {
  return note("c3").s("square").struct("x ~ ~ ~").decay(0.2).sustain(0).gain(0.6 * gain);
}
`,
      (await store.readFile(composition.id, patternPath)).etag,
    );
    await fill(composition.id, music, 1);

    const job = await queue.start({ compositionId: composition.id, format: "wav" });
    const completed = await waitForPhase(job.id, new Set(["completed", "failed"]), 60_000);
    expect(completed.error).toBeUndefined();
    // The kick sits on beat 0. Strudel alone schedules it 0.11 s late.
    const onset = await audioOnset(completed.outputPath ?? "");
    expect(onset).toBeLessThan(0.01);
  }, 90_000);

  it("cancels proof MP4 during capture and leaves no output or temporary file", async () => {
    const composition = await writeExample(store, "proof");
    const job = await queue.start({ compositionId: composition.id, format: "mp4", quality: 80 });
    await waitForPhase(job.id, new Set(["capturing", "encoding"]));

    const canceled = queue.cancel(job.id);
    expect(canceled.phase).toBe("canceled");
    const settled = await waitForPhase(job.id, new Set(["canceled", "failed", "completed"]));
    expect(settled.phase).toBe("canceled");

    const outputPath = settled.outputPath ?? "";
    expect(path.basename(outputPath)).toMatch(/\.mp4$/);
    const tempPath = `${outputPath}.automedia-tmp.mp4`;
    await waitForFilesGone([outputPath, tempPath]);
  }, 90_000);
});
