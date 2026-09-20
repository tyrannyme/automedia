import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExportQueue } from "./export.ts";
import { type LoopbackServer } from "./http.ts";
import { startLoopbackStack } from "./loopback-stack.ts";
import { CompositionStore } from "./store.ts";
import { writeExample } from "./examples/index.ts";

function hasBinary(binary: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${binary}`], { stdio: "ignore" }).status === 0;
}

const missing = [
  ...(hasBinary("ffmpeg") ? [] : ["ffmpeg"]),
  ...(hasBinary("ffprobe") ? [] : ["ffprobe"]),
  ...(existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"]),
];
const prerequisiteMessage = missing.length > 0 ? `missing ${missing.join(", ")}` : "";

describe("export integration prerequisites", () => {
  it.skipIf(missing.length > 0)(
    prerequisiteMessage || "ffmpeg, ffprobe, and Playwright Chromium are available",
    () => {
      expect(missing).toEqual([]);
    },
  );
});

const integration = describe.skipIf(missing.length > 0);

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
  let server: LoopbackServer | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-export-int-"));
    const stack = await startLoopbackStack(root);
    store = stack.store;
    queue = stack.queue;
    server = stack.server;
  });

  afterEach(async () => {
    await server?.close();
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

  it("cancels proof MP4 during capture and leaves no output or temporary file", async () => {
    const composition = await writeExample(store, "proof");
    const job = await queue.start({ compositionId: composition.id, format: "mp4", quality: 80 });
    await waitForPhase(job.id, new Set(["capturing", "encoding"]));

    const canceled = queue.cancel(job.id);
    expect(canceled.phase).toBe("canceled");
    const settled = await waitForPhase(job.id, new Set(["canceled", "failed", "completed"]));
    expect(settled.phase).toBe("canceled");

    const outputPath = path.join(store.compositionDir(composition.id), "exports", `${job.id}.mp4`);
    const tempPath = `${outputPath}.automedia-tmp.mp4`;
    await waitForFilesGone([outputPath, tempPath]);
  }, 90_000);
});
