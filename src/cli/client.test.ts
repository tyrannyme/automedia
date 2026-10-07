import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startEngine, type RunningEngine } from "../engine/engine.ts";
import { findFreePort } from "../engine/free-port.ts";
import { connectEngine, readHealth, remoteEngine, type EngineTarget } from "./client.ts";

describe("engine client", () => {
  const engines: RunningEngine[] = [];
  const roots: string[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.close()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    for (const server of servers.splice(0)) server.close();
  });

  async function target(): Promise<EngineTarget> {
    const library = await mkdtemp(path.join(os.tmpdir(), "automedia-client-"));
    roots.push(library);
    return { port: await findFreePort(), library, explicitLibrary: true };
  }

  /** Starts an in-process engine where a real launcher would spawn one. */
  function launcher() {
    let launches = 0;
    const launch = (launchTarget: EngineTarget) => {
      launches += 1;
      void startEngine(launchTarget.library, { port: launchTarget.port }).then((engine) => {
        engines.push(engine);
      });
    };
    return { launch, launches: () => launches };
  }

  it("starts an engine when none is running, and reuses it after", async () => {
    const engineTarget = await target();
    const { launch, launches } = launcher();

    const health = await connectEngine(engineTarget, launch);
    await connectEngine(engineTarget, launch);

    expect(health).toMatchObject({ name: "automedia", library: engineTarget.library });
    expect(launches()).toBe(1);
  });

  it("calls operations remotely and keeps their error codes", async () => {
    const engineTarget = await target();
    const { launch } = launcher();
    const reconnect = () => connectEngine(engineTarget, launch);
    await reconnect();
    const engine = remoteEngine(engineTarget.port, "test", reconnect);

    const created = await engine.call("createComposition", { name: "Remote" });

    expect(created.name).toBe("Remote");
    await expect(
      engine.call("getComposition", { compositionId: "cmissing" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("starts the engine again when a call finds it gone", async () => {
    const engineTarget = await target();
    const { launch, launches } = launcher();
    const reconnect = () => connectEngine(engineTarget, launch);
    await reconnect();
    const engine = remoteEngine(engineTarget.port, "test", reconnect);
    await Promise.all(engines.splice(0).map((running) => running.close()));

    const listed = await engine.call("listCompositions");

    expect(listed).toEqual([]);
    expect(launches()).toBe(2);
  });

  it("refuses a port held by something other than Automedia", async () => {
    const server = http.createServer((_request, response) => response.end("hello"));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    // SAFETY: a TCP listener reports AddressInfo; the string form is for pipes.
    const { port } = server.address() as AddressInfo;

    await expect(readHealth(port)).rejects.toMatchObject({ code: "port_in_use" });
  });

  it("refuses an engine serving a different library than the one named", async () => {
    const engineTarget = await target();
    const { launch } = launcher();
    await connectEngine(engineTarget, launch);

    const other = { ...engineTarget, library: path.join(engineTarget.library, "other") };

    await expect(connectEngine(other, launch)).rejects.toMatchObject({
      code: "library_mismatch",
    });
  });
});
