import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { findFreePort } from "./free-port.ts";
import { startLoopbackServer, type LoopbackServer } from "./http.ts";
import { createMcpServer } from "./mcp.ts";
import { probeFile } from "./probe.ts";
import { decodeRgba, pixel } from "./rgba.ts";
import { thumbnailDimensions, thumbnailPath, ThumbnailService } from "./thumbnails.ts";
import { CompositionStore } from "./store.ts";

function commandExists(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

const missing = [
  ...(commandExists("ffmpeg") ? [] : ["ffmpeg"]),
  ...(commandExists("ffprobe") ? [] : ["ffprobe"]),
  ...(existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"]),
];
const prerequisiteMessage = missing.length > 0 ? `missing ${missing.join(", ")}` : "";

const integration = describe.skipIf(missing.length > 0);

async function waitForThumbnail(
  filePath: string,
  ready: Promise<void>,
  timeoutMs = 30_000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("timed out waiting for thumbnail")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  expect((await readFile(filePath)).byteLength).toBeGreaterThan(0);
}

integration("composition thumbnails", () => {
  let root: string;
  let previousPort: string | undefined;
  let store: CompositionStore;
  let server: LoopbackServer | undefined;
  let service: ThumbnailService | undefined;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-thumbnail-int-"));
    store = new CompositionStore(root);
    previousPort = process.env.AUTOMEDIA_LOOPBACK_PORT;
    process.env.AUTOMEDIA_LOOPBACK_PORT = String(await findFreePort());
    const events = new EventBus();
    const exports = new ExportQueue(store, () => {});
    server = await startLoopbackServer({
      store,
      exports,
      events,
      mcp: createMcpServer({ store, exports, events }),
    });
  });

  afterAll(async () => {
    await service?.close();
    await server?.close();
    await rm(root, { recursive: true, force: true });
    if (previousPort === undefined) {
      delete process.env.AUTOMEDIA_LOOPBACK_PORT;
    } else {
      process.env.AUTOMEDIA_LOOPBACK_PORT = previousPort;
    }
  });

  it("renders a low-resolution transparent PNG from the exact composition midpoint", async () => {
    const created = await store.create("Midpoint thumbnail");
    const composition = await store.updateSettings({
      compositionId: created.id,
      width: 640,
      height: 360,
      fps: 30,
      durationSeconds: 2,
      background: "transparent",
    });
    const block = await store.createBlock(composition.id, "Midpoint");
    await store.putTrack(composition.id, { ...block, duration: 2 });
    await store.updateSettings({
      compositionId: composition.id,
      durationSeconds: 2,
    });
    const htmlPath = `blocks/${block.asset}/index.html`;
    await store.deleteFile(composition.id, htmlPath);
    await store.deleteFile(composition.id, `blocks/${block.asset}/style.css`);
    await store.deleteFile(composition.id, `blocks/${block.asset}/script.js`);
    await store.writeFile(
      composition.id,
      htmlPath,
      "utf8",
      `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Midpoint</title><link rel="stylesheet" href="style.css" /></head>
  <body><div id="marker"></div><script type="module" src="script.js"></script></body>
</html>
`,
      "",
    );
    await store.writeFile(
      composition.id,
      `blocks/${block.asset}/style.css`,
      "utf8",
      `html, body { width: 100%; height: 100%; margin: 0; }
#marker {
  position: absolute;
  top: 80px;
  left: 120px;
  width: 400px;
  height: 200px;
  animation: midpoint 2s linear both;
}
@keyframes midpoint {
  0% { background: rgb(255, 0, 0); }
  50% { background: rgb(0, 255, 0); }
  100% { background: rgb(0, 0, 255); }
}
`,
      "",
    );
    await store.writeFile(composition.id, `blocks/${block.asset}/script.js`, "utf8", "", "");

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    service = new ThumbnailService(store, {
      baseUrl: server!.url,
      debounceMs: 0,
      onReady: (id) => {
        if (id === composition.id) resolveReady();
      },
      onError: (id, error) => {
        if (id === composition.id) rejectReady(error);
      },
    });

    // Exercise startup backfill rather than a renderer-only helper: the service
    // discovers the missing thumbnail, renders it, and atomically publishes it.
    await service.backfill();
    const output = thumbnailPath(store, composition.id);
    await waitForThumbnail(output, ready);

    const expected = thumbnailDimensions(composition);
    const probe = await probeFile(output);
    expect(probe.formatName).toContain("png");
    expect(probe.streams[0]).toMatchObject({
      codecName: "png",
      width: expected.width,
      height: expected.height,
    });

    const rgba = await decodeRgba(output);
    expect(rgba.byteLength).toBe(expected.width * expected.height * 4);
    const midpoint = pixel(
      rgba,
      expected.width,
      Math.floor(expected.width / 2),
      Math.floor(expected.height / 2),
    );
    expect(midpoint[0]).toBeLessThan(40);
    expect(midpoint[1]).toBeGreaterThan(220);
    expect(midpoint[2]).toBeLessThan(40);

    // The transparent composition must not be flattened to a solid background.
    const corner = pixel(rgba, expected.width, 0, 0);
    expect(corner[3]).toBe(0);

    const temporaryFiles = (await readdir(path.dirname(output))).filter(
      (entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.png"),
    );
    expect(temporaryFiles).toEqual([]);
  }, 60_000);
});

describe("composition thumbnail prerequisites", () => {
  it.skipIf(missing.length > 0)(
    prerequisiteMessage || "ffmpeg, ffprobe, and Playwright Chromium are available",
    () => {
      expect(missing).toEqual([]);
    },
  );
});
