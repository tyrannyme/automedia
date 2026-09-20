import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "@shared/errors.ts";
import type { Composition } from "@shared/schemas.ts";
import { CompositionStore } from "./store.ts";
import { videoScaleFilter } from "./export-capture.ts";
import {
  audioCodecArgs,
  audioFilterGraph,
  atempoChain,
  ExportQueue,
  listExports,
  type ExportJob,
} from "./export.ts";

const dirs: string[] = [];

type QueueInternals = {
  jobs: Map<string, ExportJob>;
  pending: Array<{ job: ExportJob; cancel: () => void }>;
  pump: () => Promise<void>;
  cancel: (id: string) => ExportJob;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempStore(): Promise<CompositionStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-export-"));
  dirs.push(dir);
  return new CompositionStore(dir);
}

async function resize(
  store: CompositionStore,
  width: number,
  height: number,
): Promise<Composition> {
  const composition = await store.create();
  return store.updateSettings({ compositionId: composition.id, width, height });
}

describe("ExportQueue", () => {
  it("converts full-range Chromium JPEG frames to limited-range video", () => {
    expect(videoScaleFilter(1920, 1080)).toBe("scale=1920:1080:in_range=pc:out_range=tv");
  });

  it.each([
    [801, 600],
    [800, 601],
  ])("rejects odd MP4 dimensions (%d x %d)", async (width, height) => {
    const store = await tempStore();
    const composition = await resize(store, width, height);
    const queue = new ExportQueue(store, () => {});
    await expect(
      queue.start({ compositionId: composition.id, format: "mp4" }),
    ).rejects.toMatchObject({ code: "odd_dimensions" });
  });

  it("does not classify even dimensions as odd", async () => {
    const store = await tempStore();
    const composition = await resize(store, 800, 600);
    const queue = new ExportQueue(store, () => {});
    let code: string | undefined;
    try {
      await queue.start({ compositionId: composition.id, format: "mp4" });
    } catch (error) {
      code = error instanceof AppError ? error.code : undefined;
    }
    expect(code).not.toBe("odd_dimensions");
  });

  it.each([
    [{ format: "png", quality: 80 }, "png does not take a quality number"],
    [{ format: "gif", quality: 80 }, "gif does not take a quality number"],
    [{ format: "wav", quality: 80 }, "wav does not take a quality number"],
    [{ format: "mp4", timeSeconds: 1 }, "timeSeconds is PNG-only"],
    [{ format: "webm", timeSeconds: 1 }, "timeSeconds is PNG-only"],
    [{ format: "mp3", timeSeconds: 1 }, "timeSeconds is PNG-only"],
  ])("rejects invalid format-specific options", async (options, message) => {
    const store = await tempStore();
    const composition = await store.create();
    const queue = new ExportQueue(store, () => {});
    // SAFETY: these deliberately malformed option combinations exercise the queue guard.
    await expect(
      queue.start({ compositionId: composition.id, ...options } as never),
    ).rejects.toMatchObject({ code: "invalid_export", message });
  });

  it("builds atempo chains within ffmpeg's supported range", () => {
    expect(atempoChain(4).match(/atempo=2/g)).toHaveLength(2);
    expect(atempoChain(0.25)).toContain("atempo=0.5");
  });

  it("delays and pads every audible track in the audio graph", () => {
    // SAFETY: audioFilterGraph only reads durationSeconds for this focused unit test.
    const composition = {
      durationSeconds: 3,
    } as Composition;
    const graph = audioFilterGraph(composition, [
      {
        id: "track",
        kind: "audio",
        asset: "tone.ogg",
        start: 0.5,
        duration: 2,
        trimStart: 0,
        rate: 1,
        volume: 1,
        mute: false,
        lane: 0,
      },
    ]);
    expect(graph).toContain("adelay=500|500");
    expect(graph).toContain("apad");
  });

  it("pads a music-only capture to the composition duration", () => {
    // SAFETY: audioFilterGraph only reads durationSeconds for this focused unit test.
    const composition = { durationSeconds: 4 } as Composition;
    const graph = audioFilterGraph(composition, [], 1);
    expect(graph).toContain("[1:a]apad=whole_dur=4");
    expect(graph).toContain("atrim=duration=4[aout]");
  });

  it("mixes already-timed music captures with asset audio", () => {
    // SAFETY: audioFilterGraph only reads durationSeconds for this focused unit test.
    const composition = { durationSeconds: 3 } as Composition;
    const graph = audioFilterGraph(
      composition,
      [
        {
          id: "track",
          kind: "audio",
          asset: "tone.ogg",
          start: 0,
          duration: 2,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 0,
        },
      ],
      1,
    );
    expect(graph).toContain("[2:a]apad");
    expect(graph).toContain("amix=inputs=2:duration=first[aout]");
  });

  it("numbers audio-only graphs from input zero", () => {
    // SAFETY: audioFilterGraph only reads durationSeconds for this focused unit test.
    const composition = { durationSeconds: 4 } as Composition;
    const graph = audioFilterGraph(composition, [], 1, 0);
    expect(graph).toContain("[0:a]apad=whole_dur=4");
  });

  it("picks audio codecs for mp3, wav, and ogg", () => {
    expect(audioCodecArgs("mp3", 80)[1]).toBe("libmp3lame");
    expect(Number(audioCodecArgs("mp3", 80)[3])).toBeGreaterThan(200_000);
    expect(audioCodecArgs("wav")).toEqual(["-c:a", "pcm_s16le"]);
    expect(audioCodecArgs("ogg", 80)).toContain("libvorbis");
  });

  it("rejects audio export when nothing is audible", async () => {
    const store = await tempStore();
    const composition = await store.create();
    const queue = new ExportQueue(store, () => {});
    await expect(
      queue.start({ compositionId: composition.id, format: "wav" }),
    ).rejects.toMatchObject({
      code: "invalid_export",
      message: "audio export needs an unmuted audio, video, or music track",
    });
  });

  it("marks an unexpected run failure as failed", async () => {
    const store = await tempStore();
    const queue = new ExportQueue(store, () => {});
    const job: ExportJob = {
      id: "jmissing",
      compositionId: "cmissing",
      format: "png",
      phase: "queued",
    };
    // SAFETY: this test exercises the queue's private pending/pump state directly.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/no-known-value-widening
    const internals = queue as unknown as QueueInternals;
    internals.pending.push({ job, cancel: () => {} });
    await internals.pump();
    expect(job.phase).toBe("failed");
    expect(job.error).toMatchObject({ code: "not_found" });
  });

  it("keeps a canceled pending job canceled", async () => {
    const store = await tempStore();
    const composition = await store.create();
    const queue = new ExportQueue(store, () => {});
    const job: ExportJob = {
      id: "jcanceled",
      compositionId: composition.id,
      format: "png",
      phase: "queued",
    };
    // SAFETY: this test exercises the queue's private pending/pump state directly.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/no-known-value-widening
    const internals = queue as unknown as QueueInternals;
    internals.pending.push({ job, cancel: () => {} });
    internals.jobs.set(job.id, job);
    internals.cancel(job.id);
    await internals.pump();
    expect(job.phase).toBe("canceled");
  });
});

describe("listExports", () => {
  it("returns finished files newest first and skips temp files", async () => {
    const store = await tempStore();
    const composition = await store.create();
    expect(await listExports(store, composition.id)).toEqual([]);
    const dir = path.join(store.compositionDir(composition.id), "exports");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "job-old.png"), "a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(dir, "job-new.mp4"), "b");
    await writeFile(path.join(dir, ".hidden.png"), "c");
    await writeFile(path.join(dir, "job.automedia-tmp.png"), "d");
    const files = await listExports(store, composition.id);
    expect(files.map((file) => file.fileName)).toEqual(["job-new.mp4", "job-old.png"]);
    expect(files[0]?.format).toBe("mp4");
  });
});
