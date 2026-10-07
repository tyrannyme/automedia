import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AppError } from "@shared/errors.ts";
import type { Composition } from "@shared/schemas.ts";
import { CompositionStore } from "./store.ts";
import { frameDelays, videoEncoding } from "./export-capture.ts";
import { ExportQueue, listExports, type ExportJob } from "./export.ts";
import { RenderPool } from "./render-pool.ts";

const dirs: string[] = [];

type QueueInternals = {
  jobs: Map<string, ExportJob>;
  enqueue: (job: ExportJob, owner: string) => Promise<void>;
  cancel: (id: string) => ExportJob;
};

const pool = new RenderPool();

afterAll(async () => {
  await pool.close();
});

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
  it("keeps GIF and WebP frame delays on the composition clock", () => {
    const gif = frameDelays(30, 30, 10);
    expect(new Set(gif)).toEqual(new Set([30, 40]));
    expect(gif.reduce((sum, delay) => sum + delay, 0)).toBe(1000);
    expect(frameDelays(3, 30, 1)).toEqual([33, 34, 33]);
    expect(frameDelays(4, 25, 10)).toEqual([40, 40, 40, 40]);
  });

  it("maps quality to H.264 bitrate and VP9 constant quality", () => {
    expect(videoEncoding("mp4", 80).codec).toBe("avc");
    expect(videoEncoding("webm", 80).codec).toBe("vp9");
    expect(videoEncoding("webm", 1).rate).toEqual({ quantizer: 40 });
    expect(videoEncoding("webm", 100).rate).toEqual({ quantizer: 15 });
    expect(videoEncoding("mp4", 80).rate).toEqual({ bitrate: 4_250_000 });
  });

  it.each([
    [801, 600],
    [800, 601],
  ])("rejects odd MP4 dimensions (%d x %d)", async (width, height) => {
    const store = await tempStore();
    const composition = await resize(store, width, height);
    const queue = new ExportQueue(store, pool, () => {});
    await expect(
      queue.start({ compositionId: composition.id, format: "mp4" }),
    ).rejects.toMatchObject({ code: "odd_dimensions" });
  });

  it("does not classify even dimensions as odd", async () => {
    const store = await tempStore();
    const composition = await resize(store, 800, 600);
    const queue = new ExportQueue(store, pool, () => {});
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
    const queue = new ExportQueue(store, pool, () => {});
    // SAFETY: these deliberately malformed option combinations exercise the queue guard.
    await expect(
      queue.start({ compositionId: composition.id, ...options } as never),
    ).rejects.toMatchObject({ code: "invalid_export", message });
  });

  it("rejects audio export when nothing is audible", async () => {
    const store = await tempStore();
    const composition = await store.create();
    const queue = new ExportQueue(store, pool, () => {});
    await expect(
      queue.start({ compositionId: composition.id, format: "wav" }),
    ).rejects.toMatchObject({
      code: "invalid_export",
      message: "audio export needs an unmuted audio, video, or music track",
    });
  });

  it("marks an unexpected run failure as failed", async () => {
    const store = await tempStore();
    const queue = new ExportQueue(store, pool, () => {});
    const job: ExportJob = {
      id: "jmissing",
      compositionId: "cmissing",
      format: "png",
      phase: "queued",
    };
    // SAFETY: this test exercises the queue's private job state directly.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/no-known-value-widening
    const internals = queue as unknown as QueueInternals;
    await internals.enqueue(job, "test");
    expect(job.phase).toBe("failed");
    expect(job.error).toMatchObject({ code: "not_found" });
  });

  it("keeps a canceled pending job canceled", async () => {
    const store = await tempStore();
    const composition = await store.create();
    const queue = new ExportQueue(store, pool, () => {});
    const job: ExportJob = {
      id: "jcanceled",
      compositionId: composition.id,
      format: "png",
      phase: "queued",
    };
    // SAFETY: this test exercises the queue's private job state directly.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/no-known-value-widening
    const internals = queue as unknown as QueueInternals;
    internals.jobs.set(job.id, job);
    internals.cancel(job.id);
    await internals.enqueue(job, "test");
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
