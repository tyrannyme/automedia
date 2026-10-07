import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startEngine, type RunningEngine } from "./engine.ts";
import { ownerHeader, type EngineHealth } from "./protocol.ts";
import { engineVersion } from "./version.ts";

type ApiInput = Record<string, string | number>;

async function api(engine: RunningEngine, name: string, input?: ApiInput): Promise<Response> {
  return fetch(`${engine.server.url}/api/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", [ownerHeader]: "test-agent" },
    body: input === undefined ? "" : JSON.stringify(input),
  });
}

describe("engine", () => {
  const engines: RunningEngine[] = [];
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.close()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function start(): Promise<RunningEngine> {
    const root = await mkdtemp(path.join(os.tmpdir(), "automedia-engine-"));
    roots.push(root);
    const engine = await startEngine(root, { port: 0 });
    engines.push(engine);
    return engine;
  }

  it("binds a free port when asked, so test engines run beside the studio", async () => {
    const first = await start();
    const second = await start();

    expect(first.server.port).toBeGreaterThan(0);
    expect(second.server.port).not.toBe(first.server.port);
    expect(first.server.url).toBe(`http://127.0.0.1:${first.server.port}`);
  });

  it("identifies itself on /health so clients can tell it from other services", async () => {
    const engine = await start();

    // SAFETY: /health always answers with EngineHealth.
    const health = (await (await fetch(`${engine.server.url}/health`)).json()) as EngineHealth;

    expect(health).toEqual({
      ok: true,
      name: "automedia",
      version: engineVersion,
      pid: process.pid,
      library: engine.store.root,
      busy: false,
      bundle: expect.any(String),
      builtAt: expect.any(Number),
    });
  });

  it("runs operations over /api and reports errors in the same envelope", async () => {
    const engine = await start();

    const created = await api(engine, "createComposition", { name: "Over HTTP" });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body).toMatchObject({ ok: true, data: { name: "Over HTTP" } });

    // SAFETY: a successful listCompositions call answers with an array of compositions.
    const listed = (await (await api(engine, "listCompositions")).json()) as { data: object[] };
    expect(listed.data).toHaveLength(1);

    const missing = await api(engine, "getComposition", { compositionId: "cmissing" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "not_found" } });

    const invalid = await api(engine, "getComposition", { compositionId: "../etc" });
    expect(invalid.status).toBe(400);

    const unknown = await api(engine, "dropTables");
    expect(unknown.status).toBe(404);
  });

  it("refuses API calls from web pages on other origins", async () => {
    const engine = await start();

    const response = await fetch(`${engine.server.url}/api/listCompositions`, {
      method: "POST",
      headers: { origin: "https://example.com" },
    });

    expect(response.status).toBe(403);
  });

  it("requires absolute paths for files outside the library", async () => {
    const engine = await start();

    const response = await api(engine, "importProject", { path: "relative.automedia" });

    expect(response.status).toBe(400);
  });
});
