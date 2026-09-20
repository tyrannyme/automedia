import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { type Browser } from "playwright";
import type { Composition } from "@shared/schemas.ts";
import { frameFromTime } from "@shared/clock.ts";
import { createId, removeFile } from "./fs.ts";
import { compositionContentUrl } from "./loopback.ts";
import { captureLoopSeam } from "./loop-seam.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";
import { launchChromium } from "./chromium.ts";
import type { EventBus } from "./events.ts";
import type { CompositionStore } from "./store.ts";

/** The thumbnail is intentionally small enough for a project switcher. */
export const thumbnailMaxWidth = 320;
export const thumbnailMaxHeight = 180;
export const thumbnailSourceMaxDimension = 16_384;
export const thumbnailSourceMaxPixels = 64 * 1024 * 1024;
const thumbnailDirectory = ".automedia";
const thumbnailName = "thumbnail.png";
const defaultDebounceMs = 500;

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

export function thumbnailUrl(baseUrl: string, compositionId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/compositions/${encodeURIComponent(compositionId)}/thumbnail.png`;
}

export type ThumbnailCaptureOptions = {
  composition: Composition;
  baseUrl: string;
  outputPath: string;
};

export type ThumbnailCapture = (options: ThumbnailCaptureOptions) => Promise<void>;

/**
 * A renderer kept separate from the queue so the queue can be tested without
 * launching Chromium. The browser is reused, while each page gets an isolated
 * context and is always closed after one composition.
 */
export class ChromiumThumbnailRenderer {
  private browser: Browser | undefined;

  async capture(options: ThumbnailCaptureOptions): Promise<void> {
    assertSafeSourceSize(options.composition);
    if (!this.browser || !this.browser.isConnected()) {
      await this.resetBrowser();
      this.browser = await launchChromium();
    }
    try {
      await this.captureWithBrowser(options);
    } catch (error) {
      if (this.browser?.isConnected() !== false) throw error;
      await this.resetBrowser();
      this.browser = await launchChromium();
      await this.captureWithBrowser(options);
    }
  }

  private async captureWithBrowser(options: ThumbnailCaptureOptions): Promise<void> {
    const browser = this.browser;
    if (!browser) throw new Error("thumbnail browser is unavailable");
    const context = await browser.newContext({
      viewport: { width: options.composition.width, height: options.composition.height },
      deviceScaleFactor: Math.min(
        1,
        thumbnailMaxWidth / options.composition.width,
        thumbnailMaxHeight / options.composition.height,
      ),
    });
    const page = await context.newPage();
    try {
      const url = compositionContentUrl(options.baseUrl, options.composition.id);
      const response = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      if (!response || !response.ok()) {
        throw new Error(`thumbnail content returned ${response?.status() ?? "no response"}`);
      }
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
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async compareLoopSeam(options: ThumbnailCaptureOptions): Promise<boolean> {
    assertSafeSourceSize(options.composition);
    if (!this.browser || !this.browser.isConnected()) {
      await this.resetBrowser();
      this.browser = await launchChromium();
    }
    try {
      return await this.compareWithBrowser(options);
    } catch (error) {
      if (this.browser?.isConnected() !== false) throw error;
      await this.resetBrowser();
      this.browser = await launchChromium();
      return await this.compareWithBrowser(options);
    }
  }

  private async compareWithBrowser(options: ThumbnailCaptureOptions): Promise<boolean> {
    const browser = this.browser;
    if (!browser) throw new Error("thumbnail browser is unavailable");
    const context = await browser.newContext({
      viewport: { width: options.composition.width, height: options.composition.height },
      deviceScaleFactor: Math.min(
        1,
        thumbnailMaxWidth / options.composition.width,
        thumbnailMaxHeight / options.composition.height,
      ),
    });
    const page = await context.newPage();
    try {
      const url = compositionContentUrl(options.baseUrl, options.composition.id);
      const response = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      if (!response || !response.ok()) {
        throw new Error(`loop seam content returned ${response?.status() ?? "no response"}`);
      }
      return await captureLoopSeam(
        page,
        options.composition.fps,
        options.composition.durationSeconds,
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  private async resetBrowser(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    await browser?.close().catch(() => undefined);
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    await browser?.close().catch(() => undefined);
  }
}

type PendingComposition = {
  revision: number;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export type ThumbnailServiceOptions = {
  /** The actual bound loopback origin, including a non-default port if used. */
  baseUrl: string;
  debounceMs?: number;
  capture?: ThumbnailCapture;
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
  private active: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly store: CompositionStore,
    private readonly options: ThumbnailServiceOptions,
  ) {
    this.debounceMs = options.debounceMs ?? defaultDebounceMs;
    if (options.capture) {
      this.capture = options.capture;
    } else {
      this.renderer = new ChromiumThumbnailRenderer();
      this.capture = (captureOptions) => this.renderer!.capture(captureOptions);
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
    // Close Chromium concurrently with the active task. A page navigation or
    // runtime seek can otherwise keep the main-process shutdown waiting for an
    // unbounded amount of time; closing the browser aborts that work and lets
    // the task settle through its normal cleanup path.
    const active = this.active;
    const rendererClose = this.renderer?.close();
    await Promise.allSettled([active, rendererClose]);
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

function isNotFoundError(error: Error): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
