import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { findFreePort } from "./free-port.ts";
import { startLoopbackServer, type LoopbackServer } from "./http.ts";
import { createMcpServer } from "./mcp.ts";
import { CompositionStore } from "./store.ts";

describe("events endpoint CORS", () => {
  let root: string;
  let server: LoopbackServer | undefined;
  let events: EventBus;
  let previousPort: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-http-events-"));
    previousPort = process.env.AUTOMEDIA_LOOPBACK_PORT;
    process.env.AUTOMEDIA_LOOPBACK_PORT = String(await findFreePort());
    const store = new CompositionStore(root);
    events = new EventBus();
    const exports = new ExportQueue(store, () => {});
    server = await startLoopbackServer({
      store,
      exports,
      events,
      mcp: createMcpServer({ store, exports, events }),
    });
  });

  afterEach(async () => {
    await server?.close();
    if (previousPort === undefined) {
      delete process.env.AUTOMEDIA_LOOPBACK_PORT;
    } else {
      process.env.AUTOMEDIA_LOOPBACK_PORT = previousPort;
    }
    await rm(root, { recursive: true, force: true });
  });

  it.each(["http://localhost:5173", "null"])(
    "keeps an SSE connection open for the desktop origin %s and forwards events",
    async (origin) => {
      const controller = new AbortController();
      const response = await fetch(`${server?.url}/events`, {
        headers: { origin },
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("vary")).toBe("Origin");
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("SSE response has no readable body");
      const decoder = new TextDecoder();
      const initial = await reader.read();
      expect(initial.done).toBe(false);
      expect(decoder.decode(initial.value)).toContain(":\n\n");

      events.emit({ type: "cors_test" });
      const event = await reader.read();
      expect(event.done).toBe(false);
      expect(decoder.decode(event.value)).toContain('data: {"type":"cors_test"}');

      await reader.cancel();
      controller.abort();
    },
  );

  it("allows a dynamic 127.0.0.1 origin and rejects a remote origin intentionally", async () => {
    const loopbackOrigin = `http://127.0.0.1:${server?.port}`;
    const allowed = await fetch(`${server?.url}/events`, {
      headers: { origin: loopbackOrigin },
      signal: AbortSignal.timeout(5_000),
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(loopbackOrigin);
    expect(allowed.headers.get("vary")).toBe("Origin");
    await allowed.body?.cancel();

    const rejected = await fetch(`${server?.url}/events`, {
      headers: { origin: "https://example.com" },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    expect(rejected.headers.get("vary")).toBe("Origin");
    await expect(rejected.json()).resolves.toEqual({
      code: "forbidden",
      message: "Origin not allowed",
    });
  });
});
