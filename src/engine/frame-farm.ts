import os from "node:os";
import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import { timeFromFrame } from "@shared/clock.ts";
import type { Composition } from "@shared/schemas.ts";
import { connectCdp, type CdpTarget } from "./cdp.ts";
import { launchChromium } from "./chromium.ts";
import { findFreePort } from "./free-port.ts";

/**
 * Chromium draws a frame only when the farm sends `beginFrame`, and runs
 * every compositor stage before it draws, so a screenshot is exactly the
 * frame the page finished: never half drawn, never an older one.
 *
 * The browsers composite in software. On the GPU each one draws a little
 * cheaper, but their screenshots queue for the one device, and a farm of
 * them captures slower than the same farm on the CPU.
 */
const beginFrameArgs = [
  "--deterministic-mode",
  "--enable-begin-frame-control",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-checker-imaging",
  "--disable-image-animation-resync",
  "--enable-surface-synchronization",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-background-media-suspend",
  // A seek throws away whatever a video decoded ahead; on one thread it
  // decodes less ahead, and the farm already keeps every core busy.
  "--video-threads=1",
];

const frameInterval = 1000 / 60;
const frameTimeoutMs = 60_000;
const screenshotAttempts = 20;
/** Display frames a seeked video gets to hand its new frame over in. */
const presentAttempts = 30;
/**
 * Display frames drawn after a seek and before the screenshot. A `<video>`
 * the page just unhid sends its picture to the compositor on a frame of its
 * own; without these, the screenshot can catch its layer still empty.
 */
const settleFrames = 2;
/** JPEG keeps each frame small to move and fast to decode. */
const jpegQuality = 92;

/** The 1px marker the screenshot frame changes, so Chromium always draws it. */
const nudgeMarker = `(() => {
  let marker = document.getElementById("automedia-frame-marker");
  if (!marker) {
    marker = document.createElement("div");
    marker.id = "automedia-frame-marker";
    marker.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;background:#000;pointer-events:none;z-index:2147483647";
    document.documentElement.append(marker);
  }
  // Both opacities round to alpha 0, so no captured pixel changes.
  marker.style.opacity = marker.style.opacity === "0.001" ? "0.0015" : "0.001";
})()`;

/**
 * Marks each `<video>` stale when it starts seeking, and fresh once
 * Chromium hands one of its frames to the compositor. A video seeked while
 * hidden keeps its old picture in the compositor until it is shown again and
 * hands the new one over, which can take a few frames.
 */
const watchVideos = `(() => {
  const watch = (video) => {
    if (video.automediaStale !== undefined) return;
    video.automediaStale = true;
    video.addEventListener("seeking", () => { video.automediaStale = true; });
    const presented = () => { video.automediaStale = false; video.requestVideoFrameCallback(presented); };
    video.requestVideoFrameCallback(presented);
  };
  const scan = (node) => {
    if (node.nodeName === "VIDEO") watch(node);
    if (node.querySelectorAll) for (const video of node.querySelectorAll("video")) watch(video);
  };
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
  }).observe(document, { childList: true, subtree: true });
})()`;

/** How many shown videos have seeked but not yet drawn the new frame. */
const staleVideos = `(() => {
  let count = 0;
  const visit = (doc) => {
    for (const video of doc.querySelectorAll("video")) {
      if (video.automediaStale && video.readyState >= 2 && video.checkVisibility({ visibilityProperty: true })) count += 1;
    }
    for (const frame of doc.querySelectorAll("iframe")) {
      try { if (frame.contentDocument) visit(frame.contentDocument); } catch {}
    }
  };
  visit(document);
  return count;
})()`;

const versionSchema = v.object({ webSocketDebuggerUrl: v.string() });
const contextSchema = v.object({ browserContextId: v.string() });
const targetSchema = v.object({ targetId: v.string() });
const attachSchema = v.object({ sessionId: v.string() });
const beginFrameSchema = v.object({ screenshotData: v.optional(v.string()) });
const evaluateSchema = v.object({
  result: v.optional(v.object({ value: v.optional(v.unknown()) })),
  exceptionDetails: v.optional(
    v.object({
      text: v.optional(v.string()),
      exception: v.optional(v.object({ description: v.optional(v.string()) })),
    }),
  ),
});

/**
 * Browsers that capture one video export together. Each is its own process
 * with its own compositor, so they draw in parallel; a frame keeps about two
 * cores busy across a browser's processes, and each browser holds a few
 * hundred megabytes.
 */
export function farmWorkers(cores = os.availableParallelism(), memory = os.totalmem()): number {
  const byMemory = Math.floor(memory / 2 ** 30);
  return Math.max(1, Math.min(16, Math.floor(cores / 2), byMemory));
}

export type FarmPage = {
  /** Seeks to `frame` and returns the frame Chromium draws, as a JPEG. */
  capture(frame: number): Promise<Buffer>;
  close(): Promise<void>;
};

/** Opens `url` in a browser of its own whose frames the farm draws. */
export async function openFarmPage(composition: Composition, url: string): Promise<FarmPage> {
  const port = await findFreePort();
  const browser = await launchChromium([...beginFrameArgs, `--remote-debugging-port=${port}`]);
  try {
    const version = v.parse(
      versionSchema,
      await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(),
    );
    const cdp = await connectCdp(version.webSocketDebuggerUrl);
    const { browserContextId } = await cdp.request(
      "Target.createBrowserContext",
      {},
      contextSchema,
    );
    const { targetId } = await cdp.request(
      "Target.createTarget",
      {
        url: "about:blank",
        browserContextId,
        enableBeginFrameControl: true,
        width: composition.width,
        height: composition.height,
      },
      targetSchema,
    );
    const { sessionId } = await cdp.request(
      "Target.attachToTarget",
      { targetId, flatten: true },
      attachSchema,
    );
    const page = farmSession(cdp.session(sessionId));
    await page.send("Page.enable");
    await page.send("HeadlessExperimental.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: composition.width,
      height: composition.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: watchVideos });
    await page.send("Page.navigate", { url });
    await page.whileDrawing(page.loaded(), "the composition did not load");
    await page.whileDrawing(
      page.run("window.automedia.ready()"),
      "the composition never got ready",
    );
    return {
      async capture(frame) {
        const time = timeFromFrame(frame, composition.fps);
        // The seek answers with how many shown videos still owe their new
        // frame; draw until they have all handed it over.
        let stale = await page.whileDrawing(
          page.evaluate(
            `Promise.resolve(window.automedia.seek(${time}, ${frame})).then(() => ${staleVideos})`,
            v.number(),
          ),
          `frame ${frame} did not draw`,
        );
        for (let attempt = 0; stale !== 0 && attempt < presentAttempts; attempt += 1) {
          await page.send("HeadlessExperimental.beginFrame", { interval: frameInterval });
          stale = await page.evaluate(staleVideos, v.number());
        }
        for (let index = 0; index < settleFrames; index += 1) {
          await page.send("HeadlessExperimental.beginFrame", { interval: frameInterval });
        }
        // No damage means Chromium drew nothing new for this frame. The last
        // screenshot is not the answer, so nudge the marker and draw again.
        for (let attempt = 0; attempt < screenshotAttempts; attempt += 1) {
          await page.run(nudgeMarker);
          const drawn = await page.request(
            "HeadlessExperimental.beginFrame",
            {
              interval: frameInterval,
              screenshot: { format: "jpeg", quality: jpegQuality, optimizeForSpeed: true },
            },
            beginFrameSchema,
          );
          if (drawn.screenshotData) return Buffer.from(drawn.screenshotData, "base64");
        }
        throw new AppError("encode_failed", `frame ${frame} was never drawn`);
      },
      async close() {
        cdp.close();
        await browser.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

function farmSession(target: CdpTarget) {
  return {
    ...target,
    /** Runs `expression` in the page, waits for its promise, and parses its value. */
    async evaluate<T>(expression: string, schema: v.GenericSchema<T>): Promise<T> {
      const reply = await target.request(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        evaluateSchema,
      );
      if (reply.exceptionDetails) {
        const details = reply.exceptionDetails;
        throw new AppError(
          "encode_failed",
          details.exception?.description ?? details.text ?? "the composition threw",
        );
      }
      return v.parse(schema, reply.result?.value);
    },
    /** Runs `expression` in the page and waits for its promise. */
    async run(expression: string): Promise<void> {
      await this.evaluate(expression, v.unknown());
    },
    /** Settles once the composition has loaded with the runtime injected. */
    async loaded(): Promise<void> {
      const check = `location.href !== "about:blank" && document.readyState === "complete" && Boolean(window.automedia)`;
      // Until the navigation commits, a check can land in the old document.
      while (!(await this.evaluate(check, v.boolean()).catch(() => false))) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    /**
     * Waits for `work` while drawing frames without showing them, so
     * `requestAnimationFrame` callbacks and media in the page keep running.
     * Gives up with `timeoutMessage` if the work takes over a minute.
     */
    async whileDrawing<T>(work: Promise<T>, timeoutMessage: string): Promise<T> {
      const progress = { settled: false };
      const done = work.finally(() => {
        progress.settled = true;
      });
      done.catch(() => undefined);
      const deadline = Date.now() + frameTimeoutMs;
      while (!progress.settled) {
        if (Date.now() > deadline) throw new AppError("encode_failed", timeoutMessage);
        await target.send("HeadlessExperimental.beginFrame", {
          interval: frameInterval,
          noDisplayUpdates: true,
        });
        if (!progress.settled) await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return done;
    },
  };
}
