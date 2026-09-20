import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { exampleIds, listExamples, writeExample } from "./examples/index.ts";
import { exportFileExists, ExportQueue } from "./export.ts";
import { type LoopbackServer } from "./http.ts";
import { startLoopbackStack } from "./loopback-stack.ts";
import { probeFile, type ProbeResult } from "./probe.ts";
import { seekInjectedRuntime } from "./page-runtime.ts";
import { decodeRgba, pixel } from "./rgba.ts";
import { CompositionStore } from "./store.ts";
import { validateComposition, type ValidationReport } from "./validate.ts";
import type { Composition, ExportFormat } from "@shared/schemas.ts";
import type { AutomediaRuntime } from "@shared/runtime-types.ts";

declare global {
  var automedia: AutomediaRuntime;
}

const missing = [
  ...(commandExists("ffmpeg") ? [] : ["ffmpeg"]),
  ...(commandExists("ffprobe") ? [] : ["ffprobe"]),
  ...(existsSync(chromium.executablePath()) ? [] : ["current Chromium"]),
];
const prerequisiteMessage = `missing ${missing.join(", ")}`;

function commandExists(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

type TestContext = {
  root: string;
  store: CompositionStore;
  queue: ExportQueue;
  server: LoopbackServer;
};

type ExportResult = {
  filePath: string;
  wallMs: number;
  probe?: ProbeResult;
};

let context: TestContext;

async function waitForJob(queue: ExportQueue, jobId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = queue.get(jobId);
    if (job.phase === "completed" || job.phase === "failed" || job.phase === "canceled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for export ${jobId}`);
}

async function exportFile(
  composition: Composition,
  format: ExportFormat,
  options: { timeSeconds?: number; quality?: number } = {},
): Promise<ExportResult> {
  const started = performance.now();
  const job = await context.queue.start({ compositionId: composition.id, format, ...options });
  const completed = await waitForJob(context.queue, job.id);
  expect(completed.phase, completed.error?.message).toBe("completed");
  const filePath = await exportFileExists(context.store, composition.id, job.id);
  const result: ExportResult = { filePath, wallMs: performance.now() - started };
  if (
    format === "mp4" ||
    format === "webm" ||
    format === "mp3" ||
    format === "wav" ||
    format === "ogg"
  ) {
    result.probe = await probeFile(filePath);
  }
  return result;
}

function parseCssRgb(color: string): [number, number, number] {
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (srgb) {
    return [
      Math.round(Number(srgb[1]) * 255),
      Math.round(Number(srgb[2]) * 255),
      Math.round(Number(srgb[3]) * 255),
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(color);
  if (!rgb) throw new Error(`unsupported CSS color serialization: ${color}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function parseTailwindAmber(
  color: string,
):
  | { format: "oklch"; lightness: number; chroma: number; hue: number }
  | { format: "rgb"; channels: [number, number, number] } {
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (oklch) {
    return {
      format: "oklch",
      lightness: Number(oklch[1]),
      chroma: Number(oklch[2]),
      hue: Number(oklch[3]),
    };
  }
  return { format: "rgb", channels: parseCssRgb(color) };
}

async function capturePagePng(
  composition: Composition,
  filePath: string,
  timeSeconds: number,
  controls?: Record<string, boolean | number | string>,
): Promise<void> {
  const browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    handleSIGINT: false,
    handleSIGTERM: false,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: composition.width, height: composition.height },
      deviceScaleFactor: 1,
    });
    const response = await page.goto(
      `${context.server.url}/compositions/${composition.id}/content/index.html`,
      { waitUntil: "load" },
    );
    expect(response?.ok()).toBe(true);
    await page.evaluate(async () => {
      await globalThis.automedia.ready();
    });
    await seekInjectedRuntime(page, timeSeconds, Math.round(timeSeconds * composition.fps));
    if (controls) {
      await page.evaluate(async (values) => {
        await globalThis.automedia.setControls(values);
      }, controls);
    }
    await page.screenshot({
      path: filePath,
      omitBackground: composition.background === "transparent",
    });
  } finally {
    await browser.close();
  }
}

async function waitForFrame(page: Page, url: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((item) => item.url() === url);
    if (frame) return frame;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for frame ${url}`);
}

async function captureFramedPagePng(
  composition: Composition,
  filePath: string,
  timeSeconds: number,
  controls?: Record<string, boolean | number | string>,
): Promise<void> {
  const browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    handleSIGINT: false,
    handleSIGTERM: false,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: composition.width, height: composition.height },
      deviceScaleFactor: 1,
    });
    const src = `${context.server.url}/compositions/${composition.id}/content/index.html`;
    await page.goto(`${context.server.url}/health`, { waitUntil: "load" });
    await page.setContent(
      `<!doctype html>
<html>
  <head>
    <style>html, body { margin: 0; overflow: hidden; } iframe { border: 0; display: block; }</style>
  </head>
  <body>
    <iframe id="preview" src="${src}" width="${composition.width}" height="${composition.height}"></iframe>
  </body>
</html>`,
      { waitUntil: "load" },
    );
    const compositor = await waitForFrame(page, src);
    await compositor.waitForFunction(() => Boolean(globalThis.automedia));
    expect(await compositor.evaluate("window === window.top")).toBe(false);
    expect(
      await compositor.evaluate("document.documentElement.dataset.automediaCompositor === 'true'"),
    ).toBe(true);
    await compositor.evaluate(async () => {
      await globalThis.automedia.ready();
    });
    await compositor.evaluate(
      async ({ timeSeconds: requestedTime, frame: requestedFrame }) => {
        await globalThis.automedia.seek(requestedTime, requestedFrame);
      },
      { timeSeconds, frame: Math.round(timeSeconds * composition.fps) },
    );
    if (controls) {
      await compositor.evaluate(async (values) => {
        await globalThis.automedia.setControls(values);
      }, controls);
    }
    await page.screenshot({
      path: filePath,
      omitBackground: composition.background === "transparent",
    });
  } finally {
    await browser.close();
  }
}

async function openPage(composition: Composition) {
  const browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    handleSIGINT: false,
    handleSIGTERM: false,
  });
  const page = await browser.newPage({
    viewport: { width: composition.width, height: composition.height },
    deviceScaleFactor: 1,
  });
  const response = await page.goto(
    `${context.server.url}/compositions/${composition.id}/content/index.html`,
    { waitUntil: "load" },
  );
  expect(response?.ok()).toBe(true);
  await page.evaluate(async () => {
    await globalThis.automedia.ready();
  });
  return { browser, page };
}

async function write(id: (typeof exampleIds)[number]): Promise<Composition> {
  return writeExample(context.store, id);
}

type ExpectedSettings = Pick<
  Composition,
  "name" | "width" | "height" | "fps" | "durationSeconds" | "background"
>;

const expectedSettings = {
  "css-clock": {
    name: "CSS clock",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#202020",
  },
  "renderer-clock": {
    name: "Renderer clock",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#102030",
  },
  "three-clock": {
    name: "Three clock",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#101018",
  },
  "vgpu-shader": {
    name: "vGPU shader",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 4,
    background: "#040619",
  },
  "motion-clock": {
    name: "Motion clock",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#181818",
  },
  "tailwind-page": {
    name: "Tailwind page",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 1,
    background: "#0f172a",
  },
  "media-pair": {
    name: "Media pair",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#101018",
  },
  "controls-knobs": {
    name: "Controls knobs",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 1,
    background: "#111111",
  },
  "alpha-still": {
    name: "Alpha still",
    width: 256,
    height: 256,
    fps: 30,
    durationSeconds: 1,
    background: "transparent",
  },
  "silent-video": {
    name: "Silent video",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#101018",
  },
  "strudel-music": {
    name: "Strudel music",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 4,
    background: "#111111",
  },
  "broken-script": {
    name: "Broken script",
    width: 800,
    height: 600,
    fps: 30,
    durationSeconds: 3,
    background: "transparent",
  },
  proof: {
    name: "Proof",
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 2,
    background: "#101018",
  },
} satisfies Record<(typeof exampleIds)[number], ExpectedSettings>;

const expectedExamples = [
  { id: "css-clock", name: "CSS clock", description: "CSS animation that seek can land on." },
  {
    id: "renderer-clock",
    name: "Renderer clock",
    description: "A registered renderer that reads context.frame.",
  },
  {
    id: "three-clock",
    name: "Three clock",
    description: "Three.js cube driven by context.timeSeconds.",
  },
  {
    id: "vgpu-shader",
    name: "vGPU shader",
    description: "Deterministic WGSL plasma rendered with vGPU and the Automedia frame clock.",
  },
  {
    id: "motion-clock",
    name: "Motion clock",
    description: "Motion playback.time set from the automedia clock.",
  },
  {
    id: "tailwind-page",
    name: "Tailwind page",
    description: "Tailwind browser utilities paint in the preview.",
  },
  {
    id: "media-pair",
    name: "Media pair",
    description: "A video element plus a wav track with no element.",
  },
  {
    id: "controls-knobs",
    name: "Controls knobs",
    description: "Range, color, toggle, and select write into the renderer.",
  },
  {
    id: "alpha-still",
    name: "Alpha still",
    description: "Transparent background with a translucent square.",
  },
  {
    id: "silent-video",
    name: "Silent video",
    description: "A muted video track and no wav, so the MP4 has no audio.",
  },
  {
    id: "strudel-music",
    name: "Strudel music",
    description: "A music clip with a managed Strudel pattern.",
  },
  {
    id: "broken-script",
    name: "Broken script",
    description: "A script that throws so validate fails.",
  },
  {
    id: "proof",
    name: "Proof",
    description: "CSS, a renderer, video, and wav on one clock.",
  },
] satisfies { id: (typeof exampleIds)[number]; name: string; description: string }[];

describe("composition example fixture contract", () => {
  let root: string;
  let store: CompositionStore;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-example-fixtures-"));
    store = new CompositionStore(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes exactly the thirteen named examples, settings, files, and documents", async () => {
    expect(exampleIds).toHaveLength(13);
    expect(listExamples()).toEqual(expectedExamples);
    for (const id of exampleIds) {
      const composition = await writeExample(store, id);
      const expected = expectedSettings[id];
      expect(composition).toMatchObject(expected);
      const files = await store.listFiles(composition.id);
      expect(files).toContain("composition.json");
      expect(files).toContain("controls.json");
      expect(files).toContain("media.json");
      expect(files.includes("index.html")).toBe(false);
      if (id === "media-pair" || id === "silent-video" || id === "proof") {
        expect(files).toContain("assets/beat-ident.ogg");
        expect(files).toContain("assets/fps-guns.mp4");
      }
      const mediaDoc = await store.getMedia(composition.id);
      const block = mediaDoc.tracks.find(
        (track) => track.kind === "block" || track.kind === "music",
      );
      expect(block).toBeDefined();
      if (id === "strudel-music") {
        expect(block?.kind).toBe("music");
        expect(block?.mute).toBe(false);
        expect(
          files.some((file) => file.startsWith("music/") && file.endsWith("/pattern.js")),
        ).toBe(true);
        expect(files.some((file) => file.startsWith("blocks/"))).toBe(false);
        const pattern = (await store.readFile(composition.id, `music/${block?.asset}/pattern.js`))
          .content;
        expect(pattern).toContain("export default function pattern");
        expect(mediaDoc.tracks.filter((track) => track.kind !== "music")).toEqual([]);
      } else {
        expect(block?.kind).toBe("block");
        expect(
          files.some((file) => file.startsWith("blocks/") && file.endsWith("/index.html")),
        ).toBe(true);
        const htmlPath = `blocks/${block?.asset}/index.html`;
        const html = (await store.readFile(composition.id, htmlPath)).content;
        expect(html).toContain("<!doctype html>");
        expect(html).toContain('<link rel="stylesheet" href="style.css" />');
        expect(html).toContain('<script type="module" src="script.js"></script>');
        if (id === "vgpu-shader") {
          const shaderPath = `blocks/${block?.asset}/shader.wgsl`;
          expect(files).toContain(shaderPath);
          expect((await store.readFile(composition.id, shaderPath)).content).toContain(
            "@fragment fn fs_main",
          );
        }
      }
      if (id === "media-pair" || id === "silent-video" || id === "proof") {
        const media = await store.getMedia(composition.id);
        const authored = media.tracks.filter((track) => track.kind !== "block");
        expect(authored).toHaveLength(id === "silent-video" ? 1 : 2);
        expect(authored[0]).toMatchObject({
          id: "track-video",
          kind: "video",
          asset: "fps-guns.mp4",
          start: 0,
          duration: 2,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: id === "proof" ? 0 : 1,
        });
        if (id !== "silent-video") {
          expect(authored[1]).toMatchObject({
            id: "track-wav",
            kind: "audio",
            asset: "beat-ident.ogg",
            start: 0,
            duration: 2,
            trimStart: 0,
            rate: 1,
            volume: 1,
            mute: false,
            lane: 2,
          });
        }
      } else if (id !== "strudel-music") {
        expect(
          (await store.getMedia(composition.id)).tracks.filter((track) => track.kind !== "block"),
        ).toEqual([]);
      }
      if (id === "controls-knobs") {
        expect((await store.getControls(composition.id)).controls).toEqual([
          { id: "gain", type: "range", label: "Gain", value: 1, min: 0, max: 1, step: 0.05 },
          { id: "tint", type: "color", label: "Tint", value: "#3366ff" },
          { id: "show", type: "toggle", label: "Show", value: true },
          {
            id: "mode",
            type: "select",
            label: "Mode",
            value: "one",
            options: [
              { value: "one", label: "One" },
              { value: "two", label: "Two" },
            ],
          },
        ]);
      }
      if (id === "vgpu-shader") {
        expect((await store.getControls(composition.id)).controls).toEqual([
          {
            id: "intensity",
            type: "range",
            label: "Intensity",
            value: 1,
            min: 0.35,
            max: 1.5,
            step: 0.05,
          },
        ]);
      }
      if (id === "proof") {
        expect((await store.getControls(composition.id)).controls).toEqual([
          { id: "gain", type: "range", label: "Gain", value: 1, min: 0, max: 2, step: 0.1 },
        ]);
      }
    }
  });
});

const runtimeDescribe = describe.skipIf(missing.length > 0);

runtimeDescribe("composition examples runtime proofs", () => {
  beforeAll(async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "automedia-example-runtime-"));
    const stack = await startLoopbackStack(root);
    context = {
      root: stack.store.root,
      store: stack.store,
      queue: stack.queue,
      server: stack.server,
    };
  });

  afterAll(async () => {
    if (context.server) await context.server.close();
    if (context.root) await rm(context.root, { recursive: true, force: true });
  });

  it("runs the css, renderer, three, and motion clock proofs", async () => {
    const css = await write("css-clock");
    const cssReport = await validateComposition(css, await context.store.getMedia(css.id));
    expect(cssReport.ok).toBe(true);
    expect(cssReport.diagnostics.rendererCount).toBe(0);
    const css0 = (await exportFile(css, "png", { timeSeconds: 0 })).filePath;
    const css1 = (await exportFile(css, "png", { timeSeconds: 1 })).filePath;
    const css0Rgba = await decodeRgba(css0);
    const css1Rgba = await decodeRgba(css1);
    expect(pixel(css0Rgba, 640, 40, 180)[0]).toBeGreaterThan(200);
    expect(pixel(css0Rgba, 640, 40, 180)[1]).toBeLessThan(120);
    expect(pixel(css0Rgba, 640, 40, 180)[3]).toBe(255);
    expect(pixel(css0Rgba, 640, 320, 180)[0]).toBeLessThan(80);
    expect(pixel(css1Rgba, 640, 320, 180)[0]).toBeGreaterThan(200);

    const renderer = await write("renderer-clock");
    const rendererReport = await validateComposition(
      renderer,
      await context.store.getMedia(renderer.id),
    );
    expect(rendererReport.ok).toBe(true);
    expect(rendererReport.diagnostics.rendererCount).toBeGreaterThanOrEqual(1);
    const renderer0 = await decodeRgba(
      (await exportFile(renderer, "png", { timeSeconds: 0 })).filePath,
    );
    const renderer1 = await decodeRgba(
      (await exportFile(renderer, "png", { timeSeconds: 1 })).filePath,
    );
    expect(pixel(renderer0, 640, 16, 180)[0]).toBeGreaterThan(200);
    expect(pixel(renderer0, 640, 16, 180)[1]).toBeLessThan(40);
    expect(pixel(renderer1, 640, 16, 180)[0]).toBeLessThan(80);
    expect(pixel(renderer1, 640, 256, 180)[0]).toBeGreaterThan(200);

    const three = await write("three-clock");
    const threeReport = await validateComposition(three, await context.store.getMedia(three.id));
    expect(threeReport.ok).toBe(true);
    expect(threeReport.diagnostics.rendererCount).toBeGreaterThanOrEqual(1);
    expect(
      threeReport.issues.some(
        (issue) => issue.code === "failed_resource" && issue.message.includes("three"),
      ),
    ).toBe(false);
    const three0 = await readFile((await exportFile(three, "png", { timeSeconds: 0 })).filePath);
    const three1 = await readFile((await exportFile(three, "png", { timeSeconds: 1 })).filePath);
    expect(three0.equals(three1)).toBe(false);

    const motion = await write("motion-clock");
    const motionReport = await validateComposition(motion, await context.store.getMedia(motion.id));
    expect(motionReport.ok).toBe(true);
    expect(
      motionReport.issues.some(
        (issue) => issue.code === "failed_resource" && issue.message.includes("motion"),
      ),
    ).toBe(false);
    const motion0 = await decodeRgba(
      (await exportFile(motion, "png", { timeSeconds: 0 })).filePath,
    );
    const motion1 = await decodeRgba(
      (await exportFile(motion, "png", { timeSeconds: 1 })).filePath,
    );
    expect(pixel(motion0, 640, 40, 180)[1]).toBeGreaterThan(150);
    expect(pixel(motion1, 640, 320, 180)[1]).toBeGreaterThan(150);
    expect(pixel(motion1, 640, 40, 180)[1]).toBeLessThan(80);
  }, 180_000);

  it("renders a deterministic vGPU shader through validation and export", async () => {
    const composition = await write("vgpu-shader");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok, JSON.stringify(report.issues)).toBe(true);
    expect(report.diagnostics.rendererCount).toBeGreaterThanOrEqual(1);
    expect(
      report.issues.some(
        (issue) => issue.code === "failed_resource" && issue.message.includes("vgpu"),
      ),
    ).toBe(false);

    const mp4 = await exportFile(composition, "mp4", { quality: 80 });
    const video = mp4.probe?.streams.find((stream) => stream.codecType === "video");
    expect(video).toMatchObject({ width: 640, height: 360 });
    expect(video?.fps).toBeCloseTo(30, 1);
    expect(Math.abs((mp4.probe?.durationSeconds ?? 0) - 4)).toBeLessThanOrEqual(0.15);
    expect(mp4.probe?.streams.some((stream) => stream.codecType === "audio")).toBe(false);

    const firstPath = (await exportFile(composition, "png", { timeSeconds: 0 })).filePath;
    const laterPath = (await exportFile(composition, "png", { timeSeconds: 1.5 })).filePath;
    const [firstBytes, laterBytes, firstRgba] = await Promise.all([
      readFile(firstPath),
      readFile(laterPath),
      decodeRgba(firstPath),
    ]);
    expect(firstBytes.equals(laterBytes)).toBe(false);
    const center = pixel(firstRgba, 640, 320, 180);
    expect(center[0] + center[1] + center[2]).toBeGreaterThan(30);
    expect(center[3]).toBe(255);
  }, 180_000);

  it("proves Tailwind browser utilities in the page", async () => {
    const composition = await write("tailwind-page");
    const { browser, page } = await openPage(composition);
    try {
      const label = page.frameLocator(".block-frame").locator("#label");
      const color = await label.evaluate((element) => {
        // SAFETY: Playwright evaluates this callback in the block iframe, which has Window#getComputedStyle.
        const view = element.ownerDocument.defaultView as {
          getComputedStyle: (target: typeof element) => { color: string };
        };
        return view.getComputedStyle(element).color;
      });
      const amber = parseTailwindAmber(color);
      if (amber.format === "oklch") {
        expect(amber.lightness).toBeCloseTo(0.828, 3);
        expect(amber.chroma).toBeCloseTo(0.189, 3);
        expect(amber.hue).toBeCloseTo(84.429, 3);
      } else {
        expect(Math.abs(amber.channels[0] - 251)).toBeLessThanOrEqual(2);
        expect(Math.abs(amber.channels[1] - 191)).toBeLessThanOrEqual(2);
        expect(Math.abs(amber.channels[2] - 36)).toBeLessThanOrEqual(2);
      }
      expect(await label.getAttribute("class")).toContain("text-amber-400");
    } finally {
      await browser.close();
    }
  });

  it("proves media-pair preparation, PNG motion, and MP4 audio", async () => {
    const composition = await write("media-pair");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok).toBe(true);
    expect(report.diagnostics.prepared).toBeGreaterThanOrEqual(2);
    const png0 = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 0 })).filePath,
    );
    const png1 = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 1 })).filePath,
    );
    expect(png0.equals(png1)).toBe(false);
    const mp4 = await exportFile(composition, "mp4", { quality: 80 });
    expect(mp4.probe?.streams.some((stream) => stream.codecType === "audio")).toBe(true);
  }, 180_000);

  it("proves controls defaults and a runtime setControls update", async () => {
    const composition = await write("controls-knobs");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok).toBe(true);
    const defaults = await decodeRgba(
      (await exportFile(composition, "png", { timeSeconds: 0 })).filePath,
    );
    const defaultPixel = pixel(defaults, 640, 320, 180);
    expect(Math.abs(defaultPixel[0] - 51)).toBeLessThanOrEqual(20);
    expect(Math.abs(defaultPixel[1] - 102)).toBeLessThanOrEqual(20);
    expect(Math.abs(defaultPixel[2] - 255)).toBeLessThanOrEqual(20);
    const changedPath = path.join(context.root, "controls-red.png");
    await capturePagePng(composition, changedPath, 0, { tint: "#ff0000" });
    const changed = pixel(await decodeRgba(changedPath), 640, 320, 180);
    expect(changed[0]).toBeGreaterThan(200);
    expect(changed[1]).toBeLessThan(40);
  });

  it("forwards setControls into nested blocks when the compositor is framed", async () => {
    const composition = await write("controls-knobs");
    const framedPath = path.join(context.root, "controls-framed-red.png");
    await captureFramedPagePng(composition, framedPath, 0, { tint: "#ff0000" });
    const changed = pixel(await decodeRgba(framedPath), 640, 320, 180);
    expect(changed[0]).toBeGreaterThan(200);
    expect(changed[1]).toBeLessThan(40);
  }, 60_000);

  it("proves alpha PNG, GIF, and WebP outputs", async () => {
    const composition = await write("alpha-still");
    const png = await exportFile(composition, "png", { timeSeconds: 0 });
    const pngRgba = await decodeRgba(png.filePath);
    expect(pixel(pngRgba, 256, 0, 0)[3]).toBe(0);
    expect(pixel(pngRgba, 256, 128, 128)[3]).toBeGreaterThan(0);
    expect(pixel(pngRgba, 256, 128, 128)[0]).toBeGreaterThan(200);
    const gif = await exportFile(composition, "gif");
    const webp = await exportFile(composition, "webp", { quality: 80 });
    expect((await readFile(webp.filePath)).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect((await readFile(webp.filePath)).subarray(8, 12).toString("ascii")).toBe("WEBP");
    const gifRgba = await decodeRgba(gif.filePath);
    const webpRgba = await decodeRgba(webp.filePath);
    expect(pixel(webpRgba, 256, 0, 0)[3]).toBe(0);
    expect(pixel(webpRgba, 256, 128, 128)[3]).toBeGreaterThan(0);
    if (pixel(gifRgba, 256, 0, 0)[3] === 0)
      expect(pixel(gifRgba, 256, 128, 128)[3]).toBeGreaterThan(0);
  }, 180_000);

  it("proves a Strudel music block loads without painting", async () => {
    const composition = await write("strudel-music");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok).toBe(true);
    expect(report.diagnostics.rendererCount).toBe(0);
    expect(
      report.issues.some(
        (issue) => issue.code === "failed_resource" && issue.message.includes("strudel"),
      ),
    ).toBe(false);
    const first = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 0 })).filePath,
    );
    const later = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 2 })).filePath,
    );
    expect(first.equals(later)).toBe(true);
  }, 180_000);

  it("proves a Strudel music block exports MP4 with audio", async () => {
    const composition = await write("strudel-music");
    const mp4 = await exportFile(composition, "mp4", { quality: 80 });
    const audio = mp4.probe?.streams.find((stream) => stream.codecType === "audio");
    expect(audio, "export is missing audio").toBeDefined();
    expect(audio?.codecName.toLowerCase()).toContain("aac");
    expect(Math.abs((mp4.probe?.durationSeconds ?? 0) - composition.durationSeconds)).toBeLessThan(
      0.15,
    );
    const wav = await exportFile(composition, "wav");
    expect(wav.probe?.streams.some((stream) => stream.codecType === "video")).toBe(false);
    const wavAudio = wav.probe?.streams.find((stream) => stream.codecType === "audio");
    expect(wavAudio?.codecName.toLowerCase()).toContain("pcm");
    expect(Math.abs((wav.probe?.durationSeconds ?? 0) - composition.durationSeconds)).toBeLessThan(
      0.15,
    );
  }, 180_000);

  it("proves silent-video has prepared media but no MP4 audio", async () => {
    const composition = await write("silent-video");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.diagnostics.prepared).toBeGreaterThanOrEqual(1);
    const mp4 = await exportFile(composition, "mp4", { quality: 80 });
    expect(mp4.probe?.streams.some((stream) => stream.codecType === "audio")).toBe(false);
  }, 180_000);

  it("proves broken-script diagnostics and validate_failed export", async () => {
    const composition = await write("broken-script");
    const report: ValidationReport = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "script_error")).toBe(true);
    expect(report.issues.some((issue) => issue.message.includes("proof-throw"))).toBe(true);
    await expect(
      context.queue.start({ compositionId: composition.id, format: "png" }),
    ).rejects.toMatchObject({ code: "validate_failed" });
  });

  it("proves the complete CSS, renderer, video, and wav example", async () => {
    const composition = await write("proof");
    const report = await validateComposition(
      composition,
      await context.store.getMedia(composition.id),
    );
    expect(report.ok).toBe(true);
    expect(report.diagnostics.rendererCount).toBeGreaterThanOrEqual(1);
    expect(report.diagnostics.prepared).toBeGreaterThanOrEqual(2);
    const first = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 0 })).filePath,
    );
    const middle = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 1 })).filePath,
    );
    const last = await readFile(
      (await exportFile(composition, "png", { timeSeconds: 1.966 })).filePath,
    );
    expect(first.equals(middle)).toBe(false);
    expect(first.equals(last)).toBe(false);
    expect(middle.equals(last)).toBe(false);
    const mp4 = await exportFile(composition, "mp4", { quality: 80 });
    const mp4Video = mp4.probe?.streams.find((stream) => stream.codecType === "video");
    expect(mp4Video?.width).toBe(640);
    expect(mp4Video?.height).toBe(360);
    expect(mp4Video?.fps).toBeCloseTo(30, 1);
    expect(Math.abs((mp4.probe?.durationSeconds ?? 0) - 2)).toBeLessThanOrEqual(0.15);
    expect(mp4.probe?.streams.some((stream) => stream.codecType === "audio")).toBe(true);
    expect(mp4.wallMs).toBeLessThan(30_000);
    const webm = await exportFile(composition, "webm", { quality: 80 });
    expect(
      webm.probe?.streams.some(
        (stream) => stream.codecType === "video" && stream.codecName.toLowerCase().includes("vp9"),
      ),
    ).toBe(true);
    expect(
      webm.probe?.streams.some(
        (stream) => stream.codecType === "audio" && stream.codecName.toLowerCase().includes("opus"),
      ),
    ).toBe(true);
    const mp3 = await exportFile(composition, "mp3", { quality: 80 });
    expect(mp3.probe?.streams.some((stream) => stream.codecType === "video")).toBe(false);
    expect(
      mp3.probe?.streams.some(
        (stream) => stream.codecType === "audio" && stream.codecName.toLowerCase().includes("mp3"),
      ),
    ).toBe(true);
    const ogg = await exportFile(composition, "ogg", { quality: 80 });
    expect(
      ogg.probe?.streams.some(
        (stream) =>
          stream.codecType === "audio" && stream.codecName.toLowerCase().includes("vorbis"),
      ),
    ).toBe(true);
  }, 300_000);
});

if (missing.length > 0) {
  describe("composition example runtime prerequisites", () => {
    it.skip(prerequisiteMessage, () => undefined);
  });
}
