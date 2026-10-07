import os from "node:os";
import type { BrowserContextOptions, Page } from "playwright";
import { launchChromium } from "./chromium.ts";
import { FairQueue } from "./fair-queue.ts";

export type PageViewport = {
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

/** The parts of a Playwright browser the pool uses. */
export type PoolBrowser = {
  isConnected(): boolean;
  newContext(options: BrowserContextOptions): Promise<{
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }>;
  close(): Promise<void>;
};

export type RenderPoolOptions = {
  /** Validation, thumbnails, and loop checks: short page loads. */
  lightSlots?: number | undefined;
  /** Exports: long captures that also encode on the CPU. */
  heavySlots?: number | undefined;
  /** How long the browser stays open after the last page closes. */
  idleMs?: number;
  launch?: () => Promise<PoolBrowser>;
};

/** One light slot per four cores, between 2 and 6. */
export function defaultLightSlots(cores = os.availableParallelism()): number {
  return Math.max(2, Math.min(6, Math.floor(cores / 4)));
}

/** One export per six cores: x264 and VP9 already spread over several threads. */
export function defaultHeavySlots(cores = os.availableParallelism()): number {
  return Math.max(1, Math.floor(cores / 6));
}

/**
 * Every page the engine renders shares one browser. Each page gets its own
 * context, so cookies, storage, and viewport never leak between compositions,
 * while the browser and GPU processes are paid for once. The browser starts on
 * first use and closes after it has been idle for `idleMs`.
 */
export class RenderPool {
  readonly light: FairQueue;
  readonly heavy: FairQueue;
  private browser: Promise<PoolBrowser> | undefined;
  private pages = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly idleMs: number;
  private readonly launch: () => Promise<PoolBrowser>;

  constructor(options: RenderPoolOptions = {}) {
    this.light = new FairQueue(options.lightSlots ?? defaultLightSlots());
    this.heavy = new FairQueue(options.heavySlots ?? defaultHeavySlots());
    this.idleMs = options.idleMs ?? 60_000;
    this.launch = options.launch ?? launchChromium;
  }

  /** Pages open, plus work waiting for a slot. */
  get busy(): boolean {
    return this.pages > 0 || this.light.size > 0 || this.heavy.size > 0;
  }

  async withPage<T>(viewport: PageViewport, run: (page: Page) => Promise<T>): Promise<T> {
    this.pages += 1;
    clearTimeout(this.idleTimer);
    try {
      const browser = await this.connected();
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      });
      try {
        return await run(await context.newPage());
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      this.pages -= 1;
      if (this.pages === 0) this.scheduleClose();
    }
  }

  async close(): Promise<void> {
    clearTimeout(this.idleTimer);
    const browser = this.browser;
    this.browser = undefined;
    const open = await browser?.catch(() => undefined);
    await open?.close().catch(() => undefined);
  }

  /** Launches lazily, and again after a crash or idle close. */
  private async connected(): Promise<PoolBrowser> {
    for (;;) {
      // Taken synchronously so pages that arrive together share one launch.
      const pending = this.browser ?? this.launch();
      this.browser = pending;
      try {
        const browser = await pending;
        if (browser.isConnected()) return browser;
      } catch (error) {
        if (this.browser === pending) this.browser = undefined;
        throw error;
      }
      if (this.browser === pending) this.browser = undefined;
    }
  }

  private scheduleClose(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pages === 0) void this.close();
    }, this.idleMs);
    this.idleTimer.unref();
  }
}
