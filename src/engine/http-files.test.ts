import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendFile } from "./http-files.ts";

describe("file byte ranges", () => {
  let root: string;
  let server: Server;
  let url: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-ranges-"));
    const file = path.join(root, "sample.mp4");
    await writeFile(file, "0123456789");
    server = createServer((request, response) => {
      void sendFile(request, response, file, {
        "cross-origin-resource-policy": "cross-origin",
      }).catch((error: Error) => response.destroy(error));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = v.parse(v.object({ port: v.number() }), server.address());
    url = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ["bytes=2-5", "2345", "bytes 2-5/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=-20", "0123456789", "bytes 0-9/10"],
    ["bytes=7-20", "789", "bytes 7-9/10"],
  ])("serves %s", async (range, body, contentRange) => {
    const response = await fetch(url, { headers: { range } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(contentRange);
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(await response.text()).toBe(body);
  });

  it.each(["bytes=-", "bytes=-0", "bytes=10-", "bytes=5-2"])(
    "rejects unsatisfiable range %s",
    async (range) => {
      const response = await fetch(url, { headers: { range } });
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
      expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
      expect(await response.text()).toBe("");
    },
  );

  it("rejects a range on an empty file", async () => {
    await writeFile(path.join(root, "sample.mp4"), "");
    const response = await fetch(url, { headers: { range: "bytes=0-" } });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */0");
    await response.text();
  });

  it("serves an entire file without a range", async () => {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123456789");
  });
});
