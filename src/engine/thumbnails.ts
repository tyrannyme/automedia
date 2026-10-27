import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { Composition } from "@shared/schemas.ts";
import { frameFromTime } from "@shared/clock.ts";
import { createId, pathExists, removeFile } from "./fs.ts";
import { compositionContentUrl } from "./loopback.ts";
import { captureLoopSeam } from "./loop-seam.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";
import type { EventBus } from "./events.ts";
import type { RenderPool } from "./render-pool.ts";
import type { CompositionStore } from "./store.ts";

/** The thumbnail is intentionally small enough for a project switcher. */
export const thumbnailMaxWidth = 320;
export const thumbnailMaxHeight = 180;
export const thumbnailSourceMaxDimension = 16_384;
export const thumbnailSourceMaxPixels = 64 * 1024 * 1024;
const thumbnailDirectory = ".automedia";
const thumbnailName = "thumbnail.png";
const framesDirectory = "frames";
const defaultDebounceMs = 500;
const frameBatchMs = 30;

/** Filmstrip frames are small: a timeline lane is under 50px tall. */
export const frameMinHeight = 16;
export const frameMaxHeight = 240;
export const frameDefaultHeight = 64;

export const thumbnailMutationOperations = new Set([
  "create_composition",
  "update_settings",
  "write_file",
  "delete_file",
  "put_track",
  "delete_track",
  "put_marker",
  "delete_marker",
  "put_control",
  "delete_control",
]);

export function subscribeThumbnailMutations(
  events: Pick<EventBus, "subscribe">,
  service: { cancel: (compositionId: string) => void; request: (compositionId: string) => void },
): () => void {
  return events.subscribe((event) => {
    const compositionId = event.compositionId;
    if (!compositionId) return;
    if (event.type === "delete_composition") {
      service.cancel(compositionId);
      return;
    }
    if (thumbnailMutationOperations.has(event.type)) {
      service.request(compositionId);
    }
  });
}

export type ThumbnailDimensions = { width: number; height: number };

export function thumbnailDimensions(
  composition: Pick<Composition, "width" | "height">,
): ThumbnailDimensions {
  const scale = Math.min(
    1,
    thumbnailMaxWidth / composition.width,
    thumbnailMaxHeight / composition.height,
  );
  return {
    width: Math.max(1, Math.round(composition.width * scale)),
    height: Math.max(1, Math.round(composition.height * scale)),
  };
}

function assertSafeSourceSize(composition: Pick<Composition, "width" | "height">): void {
  if (
    composition.width > thumbnailSourceMaxDimension ||
    composition.height > thumbnailSourceMaxDimension ||
    composition.width * composition.height > thumbnailSourceMaxPixels
  ) {
    throw new Error("composition is too large to render a thumbnail safely");
  }
}

export function thumbnailPath(store: CompositionStore, compositionId: string): string {
  return path.join(store.compositionDir(compositionId), thumbnailDirectory, thumbnailName);
}

/** Where the filmstrip frames of one composition revision live. */
export function framesPath(store: CompositionStore, compositionId: string): string {
  return path.join(store.compositionDir(compositionId), thumbnailDirectory, framesDirectory);
}

export function frameHeight(requested: number): number {
  if (!Number.isFinite(requested)) return frameDefaultHeight;
  return Math.min(frameMaxHeight, Math.max(frameMinHeight, Math.round(requested)));
}

/** Frames are keyed by the manifest's updatedAt, which every authoring write bumps. */
export function frameStamp(updatedAt: string): string {
  return updatedAt.replaceAll(/[^0-9A-Za-z]/g, "") || "0";
}

export function thumbnailUrl(baseUrl: string, compositionId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/compositions/${encodeURIComponent(compositionId)}/thumbnail.png`;
}

export type ThumbnailCaptureOptions = {
  composition: Composition;
  baseUrl: string;
  outputPath: string;
};

export type ThumbnailCapture = (options: ThumbnailCaptureOptions) => Promise<void>;

export type FrameRequest = { timeSeconds: number; frame: number; outputPath: string };

export type FrameCaptureOptions = {
  composition: Composition;
  baseUrl: string;
  height: number;
  frames: FrameRequest[];
};

/** Captures several frames of one composition from one page. */
export type FrameCapture = (options: FrameCaptureOptions) => Promise<void>;

function thumbnailScale(composition: Pick<Composition, "width" | "height">): number {
  return Math.min(
    1,
    thumbnailMaxWidth / composition.width,
    thumbnailMaxHeight / composition.height,
  );
}

/**
 * A renderer kept separate from the queue so the queue can be tested without
 * launching Chromium. Pages come from the shared pool, each in its own
 * context, and wait for a light slot like validation does.
 */
export class ChromiumThumbnailRenderer {
  constructor(private readonly pool: RenderPool) {}

  async capture(options: ThumbnailCaptureOptions): Promise<void> {
    assertSafeSourceSize(options.composition);
    await this.withContentPage(options, thumbnailScale(options.composition), async (page) => {
      const midpoint = options.composition.durationSeconds / 2;
      const frame = frameFromTime(
        midpoint,
        options.composition.fps,
        options.composition.durationSeconds,
      );
      await seekInjectedRuntime(page, midpoint, frame);
      await waitForPaint(page);
      await page.screenshot({
        path: options.outputPath,
        omitBackground: options.composition.background === "transparent",
        scale: "device",
      });
    });
  }

  async captureFrames(options: FrameCaptureOptions): Promise<void> {
    const { composition } = options;
    assertSafeSourceSize(composition);
    const scale = Math.min(1, options.height / composition.height);
    await this.withContentPage(options, scale, async (page) => {
      // A fresh page's first draw can land after its first paint (WebGL above all), so the
      // first frame of a batch came out blank. Draw it once before capturing anything.
      const first = options.frames[0];
      if (first) {
        await seekInjectedRuntime(page, first.timeSeconds, first.frame);
        await waitForPaint(page);
      }
      for (const item of options.frames) {
        await seekInjectedRuntime(page, item.timeSeconds, item.frame);
        await waitForPaint(page);
        await page.screenshot({
          path: item.outputPath,
          omitBackground: composition.background === "transparent",
          scale: "device",
        });
      }
    });
  }

  async compareLoopSeam(options: ThumbnailCaptureOptions): Promise<boolean> {
    assertSafeSourceSize(options.composition);
    return this.withContentPage(options, thumbnailScale(options.composition), (page) =>
      captureLoopSeam(page, options.composition.fps, options.composition.durationSeconds),
    );
  }

  private withContentPage<T>(
    options: { composition: Composition; baseUrl: string },
    deviceScaleFactor: number,
    run: (page: Page) => Promise<T>,
  ): Promise<T> {
    const { composition } = options;
    const viewport = { width: composition.width, height: composition.height, deviceScaleFactor };
    return this.pool.light.run("thumbnails", () =>
      this.pool.withPage(viewport, async (page) => {
        const url = compositionContentUrl(options.baseUrl, composition.id);
        const response = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
        if (!response || !response.ok()) {
          throw new Error(`composition content returned ${response?.status() ?? "no response"}`);
        }
        return run(page);
      }),
    );
  }
}

type FrameBatch = {
  composition: Composition;
  directory: string;
  height: number;
  items: {
    request: FrameRequest;
    resolve: (file: string) => void;
    reject: (error: Error) => void;
  }[];
};

type PendingComposition = {
  revision: number;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export type ThumbnailServiceOptions = {
  /** The actual bound loopback origin, including a non-default port if used. */
  baseUrl: string;
  debounceMs?: number;
  /** Renders through the pool unless a capture function is given. */
  pool?: RenderPool;
  capture?: ThumbnailCapture;
  captureFrames?: FrameCapture;
  onReady?: (compositionId: string) => void;
  onError?: (compositionId: string, error: Error) => void;
};

/**
 * Coalesces authoring events and serializes thumbnail work. A revision check
 * immediately before the atomic rename prevents an older render from ever
 * replacing a newer composition thumbnail.
 */
export class ThumbnailService {
  private readonly pending = new Set<string>();
  private readonly records = new Map<string, PendingComposition>();
  private readonly debounceMs: number;
  private readonly renderer: ChromiumThumbnailRenderer | undefined;
  private readonly capture: ThumbnailCapture;
  private readonly captureFrames: FrameCapture | undefined;
  private readonly frameJobs = new Map<string, Promise<string>>();
  private readonly frameBatches = new Map<string, FrameBatch>();
  private active: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly store: CompositionStore,
    private readonly options: ThumbnailServiceOptions,
  ) {
    this.debounceMs = options.debounceMs ?? defaultDebounceMs;
    const renderer = options.pool ? new ChromiumThumbnailRenderer(options.pool) : undefined;
    this.renderer = renderer;
    if (options.capture) {
      this.capture = options.capture;
    } else if (renderer) {
      this.capture = (captureOptions) => renderer.capture(captureOptions);
    } else {
      throw new Error("thumbnails need a render pool or a capture function");
    }
    this.captureFrames =
      options.captureFrames ??
      (renderer ? (frameOptions) => renderer.captureFrames(frameOptions) : undefined);
  }

  /**
   * One filmstrip frame at a time on the timeline, cached on disk per
   * composition revision. Requests that arrive together share one page.
   */
  async frame(compositionId: string, timeSeconds: number, height: number): Promise<string> {
    if (this.stopped) throw new Error("thumbnails are closed");
    if (!this.captureFrames) throw new Error("filmstrip frames need a render pool");
    const composition = await this.store.get(compositionId);
    const size = frameHeight(height);
    const frame = frameFromTime(
      Math.max(0, timeSeconds),
      composition.fps,
      composition.durationSeconds,
    );
    const directory = path.join(
      framesPath(this.store, compositionId),
      frameStamp(composition.updatedAt),
    );
    const outputPath = path.join(directory, `${size}-${frame}.png`);
    if (await pathExists(outputPath)) return outputPath;
    const running = this.frameJobs.get(outputPath);
    if (running) return running;
    const job = new Promise<string>((resolve, reject) => {
      const key = `${directory}|${size}`;
      let batch = this.frameBatches.get(key);
      if (!batch) {
        const created: FrameBatch = { composition, directory, height: size, items: [] };
        batch = created;
        this.frameBatches.set(key, created);
        setTimeout(() => {
          this.frameBatches.delete(key);
          void this.runFrameBatch(created);
        }, frameBatchMs);
      }
      batch.items.push({
        request: { timeSeconds: frame / composition.fps, frame, outputPath },
        resolve,
        reject,
      });
    });
    this.frameJobs.set(outputPath, job);
    try {
      return await job;
    } finally {
      this.frameJobs.delete(outputPath);
    }
  }

  private async runFrameBatch(batch: FrameBatch): Promise<void> {
    const temps = batch.items.map((item) => ({
      ...item.request,
      outputPath: `${item.request.outputPath}.${createId("frame")}.tmp.png`,
    }));
    try {
      if (this.stopped || !this.captureFrames) throw new Error("thumbnails are closed");
      await mkdir(batch.directory, { recursive: true });
      await pruneStaleFrames(path.dirname(batch.directory), path.basename(batch.directory));
      await this.captureFrames({
        composition: batch.composition,
        baseUrl: this.options.baseUrl,
        height: batch.height,
        frames: temps,
      });
      for (const [index, item] of batch.items.entries()) {
        const temp = temps[index];
        if (!temp) continue;
        await rename(temp.outputPath, item.request.outputPath);
        item.resolve(item.request.outputPath);
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("frame capture failed");
      for (const item of batch.items) item.reject(error);
    } finally {
      await Promise.all(temps.map((temp) => removeFile(temp.outputPath)));
    }
  }

  /** Schedule or reschedule a thumbnail without delaying the write operation. */
  request(compositionId: string): void {
    if (this.stopped) return;
    const existing = this.records.get(compositionId);
    if (existing?.timer) clearTimeout(existing.timer);
    const record: PendingComposition = {
      revision: (existing?.revision ?? 0) + 1,
      timer: undefined,
    };
    record.timer = setTimeout(() => {
      record.timer = undefined;
      this.pending.add(compositionId);
      void this.pump();
    }, this.debounceMs);
    this.records.set(compositionId, record);
  }

  /** Schedule only when a thumbnail is absent or older than the manifest. */
  async ensure(compositionId: string): Promise<void> {
    if (this.stopped) return;
    try {
      const composition = await this.store.get(compositionId);
      await cleanupTemporaryFiles(this.store, compositionId);
      const file = thumbnailPath(this.store, compositionId);
      let current = false;
      try {
        const [thumbnail, manifest] = await Promise.all([
          stat(file),
          stat(path.join(this.store.compositionDir(compositionId), "composition.json")),
        ]);
        const updatedAt = Date.parse(composition.updatedAt);
        current =
          thumbnail.size > 0 &&
          thumbnail.mtimeMs >= manifest.mtimeMs &&
          (!Number.isFinite(updatedAt) || thumbnail.mtimeMs >= updatedAt - 1);
      } catch {
        current = false;
      }
      if (!current) this.request(compositionId);
    } catch {
      // A composition can be removed between list() and ensure(); backfill is
      // best effort and must not produce an unhandled rejection.
    }
  }

  /** Best-effort startup backfill. It does not block app readiness. */
  async backfill(): Promise<void> {
    const compositions = await this.store.list();
    await Promise.all(compositions.map((composition) => this.ensure(composition.id)));
  }

  async compareLoopSeam(compositionId: string): Promise<boolean> {
    if (!this.renderer) {
      throw new Error("loop seam comparison needs the Chromium renderer");
    }
    const composition = await this.store.get(compositionId);
    return this.renderer.compareLoopSeam({
      composition,
      baseUrl: this.options.baseUrl,
      outputPath: thumbnailPath(this.store, compositionId),
    });
  }

  /** Cancel queued work for a composition that is being deleted. */
  cancel(compositionId: string): void {
    const record = this.records.get(compositionId);
    if (record?.timer) clearTimeout(record.timer);
    this.records.delete(compositionId);
    this.pending.delete(compositionId);
  }

  async close(): Promise<void> {
    this.stopped = true;
    for (const record of this.records.values()) {
      if (record.timer) clearTimeout(record.timer);
    }
    this.records.clear();
    this.pending.clear();
    // The engine closes the pool alongside this, which aborts a page that
    // would otherwise keep shutdown waiting on a navigation or seek.
    await Promise.allSettled([this.active]);
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.active) return;
    const nextResult = this.pending.values().next();
    if (nextResult.done) return;
    const next = nextResult.value;
    this.pending.delete(next);
    const task = this.process(next);
    this.active = task;
    try {
      await task;
    } finally {
      if (this.active === task) this.active = undefined;
      void this.pump();
    }
  }

  private async process(compositionId: string): Promise<void> {
    const record = this.records.get(compositionId);
    if (!record || this.stopped) return;
    const revision = record.revision;
    const output = thumbnailPath(this.store, compositionId);
    // Playwright infers the screenshot encoder from the output suffix. Keep
    // the temporary file PNG-typed while retaining same-directory atomic rename.
    const temp = `${output}.${createId("thumbnail")}.tmp.png`;
    try {
      const composition = await this.store.get(compositionId);
      await mkdir(path.dirname(output), { recursive: true });
      await this.capture({ composition, baseUrl: this.options.baseUrl, outputPath: temp });
      const current = this.records.get(compositionId);
      if (this.stopped || !current || current.revision !== revision) return;
      // rename() is atomic when source and destination share the directory.
      await rename(temp, output);
      this.options.onReady?.(compositionId);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("thumbnail generation failed");
      if (!this.stopped && !isNotFoundError(error)) this.options.onError?.(compositionId, error);
    } finally {
      await removeFile(temp);
    }
  }
}

async function cleanupTemporaryFiles(
  store: CompositionStore,
  compositionId: string,
): Promise<void> {
  const directory = path.dirname(thumbnailPath(store, compositionId));
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(`${thumbnailName}.`) &&
          (entry.name.endsWith(".tmp") || entry.name.endsWith(".tmp.png")),
      )
      .map((entry) => rm(path.join(directory, entry.name), { force: true })),
  );
}

/** Frames of older revisions are never asked for again. */
async function pruneStaleFrames(root: string, keep: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== keep)
      .map((entry) => rm(path.join(root, entry.name), { recursive: true, force: true })),
  );
}

function isNotFoundError(error: Error): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
