import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { findFreePort } from "./free-port.ts";
import { startLoopbackServer, type LoopbackServer } from "./http.ts";
import { createMcpServer } from "./mcp.ts";
import { CompositionStore } from "./store.ts";
import { thumbnailPath } from "./thumbnails.ts";

describe("composition thumbnail route", () => {
  let root: string | undefined;
  let server: LoopbackServer | undefined;
  let previousPort: string | undefined;

  afterEach(async () => {
    await server?.close();
    if (previousPort === undefined) {
      delete process.env.AUTOMEDIA_LOOPBACK_PORT;
    } else {
      process.env.AUTOMEDIA_LOOPBACK_PORT = previousPort;
    }
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("serves an existing thumbnail and returns 404 for absent or invalid ids", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-http-thumbnail-"));
    previousPort = process.env.AUTOMEDIA_LOOPBACK_PORT;
    process.env.AUTOMEDIA_LOOPBACK_PORT = String(await findFreePort());
    const store = new CompositionStore(root);
    const events = new EventBus();
    const exports = new ExportQueue(store, () => {});
    server = await startLoopbackServer({
      store,
      exports,
      events,
      mcp: createMcpServer({ store, exports, events }),
    });

    const composition = await store.create("Thumbnail test");
    const filePath = thumbnailPath(store, composition.id);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from("not-a-real-png"));

    const response = await fetch(`${server.url}/compositions/${composition.id}/thumbnail.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("not-a-real-png");

    const missing = await fetch(
      `${server.url}/compositions/${composition.id}-missing/thumbnail.png`,
    );
    expect(missing.status).toBe(404);

    const invalid = await fetch(`${server.url}/compositions/%2e%2e/thumbnail.png`);
    expect(invalid.status).toBe(404);
  });
});
