import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { controllerSource } from "./runtime-controller.ts";
import { playwrightLaunchOptions } from "./chromium.ts";

const missing = existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"];
const integration = describe.skipIf(missing.length > 0);

integration("preview loop wrap", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch(playwrightLaunchOptions());
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 80, height: 40 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps the active clip painted while editor playback wraps", async () => {
    await page.setContent(`<!doctype html>
<html lang="en" data-automedia-width="80" data-automedia-height="40" data-automedia-fps="30" data-automedia-duration="0.2" data-automedia-background="#ff0000">
  <head>
    <style>
      html, body { margin: 0; background: #ff0000; width: 80px; height: 40px; }
      .block-frame { display: none; width: 80px; height: 40px; background: #00aa00; }
      .block-frame[data-active="true"] { display: block; }
      #clip { width: 80px; height: 40px; background: #00aa00; }
    </style>
    <script type="application/json" id="automedia-documents">${JSON.stringify({
      tracks: [
        {
          id: "t-block",
          kind: "block",
          asset: "intro",
          start: 0,
          duration: 0.2,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
      ],
      controls: [],
    })}</script>
    <script>${controllerSource}</script>
  </head>
  <body>
    <div id="clip" data-track="t-block"></div>
  </body>
</html>`);

    await page.evaluate(`(async () => {
      await globalThis.automedia.ready();
      const clip = document.getElementById("clip");
      if (clip) clip.className = "block-frame";
      window.postMessage({ source: "automedia", type: "loop", enabled: true }, "*");
      window.postMessage({ source: "automedia", type: "play" }, "*");
      await new Promise((resolve) => {
        const wait = () => {
          const frame = document.querySelector(".block-frame");
          if (frame && getComputedStyle(frame).display === "block") resolve();
          else requestAnimationFrame(wait);
        };
        wait();
      });
    })()`);

    // SAFETY: The evaluated script returns only objects with display and numeric time fields.
    const samples = (await page.evaluate(`(async () => {
      const seen = [];
      const started = performance.now();
      while (performance.now() - started < 500) {
        const frame = document.querySelector(".block-frame");
        seen.push({
          display: frame ? getComputedStyle(frame).display : "missing",
          time: Number(document.documentElement.dataset.automediaTime || 0),
        });
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
      return seen;
    })()`)) as { display: string; time: number }[];

    expect(samples.length).toBeGreaterThan(10);
    expect(Math.max(...samples.map((sample) => sample.time))).toBeGreaterThan(0);
    expect(samples.some((sample) => sample.time < 0.05)).toBe(true);
    expect(samples.some((sample) => sample.time > 0.1)).toBe(true);
    expect(samples.every((sample) => sample.display === "block")).toBe(true);
  }, 15_000);

  it("starts the clock even when a video clip cannot seek", async () => {
    await page.setContent(`<!doctype html>
<html lang="en" data-automedia-compositor="true" data-automedia-width="80" data-automedia-height="40" data-automedia-fps="30" data-automedia-duration="1" data-automedia-background="#000000">
  <head>
    <style>
      html, body { margin: 0; width: 80px; height: 40px; }
      .video-layer { display: none; }
      .video-layer[data-active="true"] { display: block; }
    </style>
    <script type="application/json" id="automedia-documents">${JSON.stringify({
      tracks: [
        {
          id: "t-video",
          kind: "video",
          asset: "missing.mp4",
          start: 0,
          duration: 1,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
      ],
      controls: [],
    })}</script>
    <script>${controllerSource}</script>
  </head>
  <body>
    <div id="stack">
      <video class="video-layer" data-track="t-video" data-automedia-media-id="t-video" src="missing.mp4"></video>
    </div>
  </body>
</html>`);

    await page.evaluate(`(async () => {
      await globalThis.automedia.ready();
      window.postMessage({ source: "automedia", type: "seek", timeSeconds: 0, frame: 0 }, "*");
      window.postMessage({ source: "automedia", type: "play" }, "*");
    })()`);

    // SAFETY: Playwright returns the evaluated array of clock samples as unknown.
    const times = (await page.evaluate(`(async () => {
      const seen = [];
      const started = performance.now();
      while (performance.now() - started < 400) {
        seen.push(Number(document.documentElement.dataset.automediaTime || 0));
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
      return seen;
    })()`)) as number[];

    expect(Math.max(...times)).toBeGreaterThan(0.05);
  }, 15_000);

  it("starts nested music once and stops it when playback is paused", async () => {
    await page.setContent(`<!doctype html>
<html lang="en" data-automedia-width="80" data-automedia-height="40" data-automedia-fps="30" data-automedia-duration="1">
  <head>
    <script type="application/json" id="automedia-documents">${JSON.stringify({
      tracks: [
        {
          id: "t-music",
          kind: "music",
          asset: "theme",
          start: 0,
          duration: 1,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 0,
        },
      ],
      controls: [],
    })}</script>
    <script>${controllerSource}</script>
  </head>
  <body>
    <iframe class="music-frame" data-track="t-music" srcdoc="<script>globalThis.messages=[];addEventListener('message',(event)=>globalThis.messages.push(event.data.type))</script>"></iframe>
  </body>
</html>`);

    await page.waitForFunction(
      `Array.isArray(document.querySelector("iframe")?.contentWindow?.messages)`,
    );
    await page.evaluate(`(async () => {
      await globalThis.automedia.ready();
      window.postMessage({ source: "automedia", type: "play" }, "*");
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      window.postMessage({ source: "automedia", type: "pause" }, "*");
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    })()`);

    // SAFETY: The iframe listener records only the string type from transport messages.
    const messages = (await page.evaluate(
      `document.querySelector("iframe")?.contentWindow?.messages`,
    )) as string[] | undefined;
    expect(messages?.filter((message) => message === "play")).toHaveLength(1);
    expect(messages).toContain("pause");
  });

  it("stops nested music when the timeline reaches its end", async () => {
    await page.setContent(`<!doctype html>
<html lang="en" data-automedia-width="80" data-automedia-height="40" data-automedia-fps="30" data-automedia-duration="0.1">
  <head>
    <script type="application/json" id="automedia-documents">${JSON.stringify({
      tracks: [
        {
          id: "t-music",
          kind: "music",
          asset: "theme",
          start: 0,
          duration: 0.1,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 0,
        },
      ],
      controls: [],
    })}</script>
    <script>${controllerSource}</script>
  </head>
  <body>
    <iframe class="music-frame" data-track="t-music" srcdoc="<script>globalThis.messages=[];addEventListener('message',(event)=>globalThis.messages.push(event.data.type))</script>"></iframe>
  </body>
</html>`);

    await page.waitForFunction(
      `Array.isArray(document.querySelector("iframe")?.contentWindow?.messages)`,
    );
    await page.evaluate(`(async () => {
      await globalThis.automedia.ready();
      window.postMessage({ source: "automedia", type: "play" }, "*");
    })()`);
    await page.waitForFunction(
      `document.documentElement.dataset.automediaTime === "0.1"`,
      undefined,
      { timeout: 2_000 },
    );

    // SAFETY: The iframe listener records only the string type from transport messages.
    const messages = (await page.evaluate(
      `document.querySelector("iframe")?.contentWindow?.messages`,
    )) as string[] | undefined;
    expect(messages?.filter((message) => message === "play")).toHaveLength(1);
    expect(messages).toContain("pause");
    expect(await page.getAttribute("html", "data-automedia-time")).toBe("0.1");
  });
});
