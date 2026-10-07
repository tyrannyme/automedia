import { spawn } from "node:child_process";
import { mkdirSync, openSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import { loopbackHost } from "@shared/limits.ts";
import type {
  Engine,
  OperationInput,
  OperationName,
  OperationResult,
} from "../engine/operations.ts";
import {
  apiReplySchema,
  engineHealthSchema,
  ownerHeader,
  type EngineHealth,
} from "../engine/protocol.ts";
import { engineVersion } from "../engine/version.ts";
import type { EngineTarget } from "./options.ts";

export type { EngineTarget };

export function engineUrl(port: number): string {
  return `http://${loopbackHost}:${port}`;
}

/** Starts an engine process for `target`. It must not wait for it to listen. */
export type EngineLauncher = (target: EngineTarget) => void;

/**
 * The running engine on `port`, or undefined if nothing listens there.
 * Throws when something that is not Automedia holds the port.
 */
export async function readHealth(port: number): Promise<EngineHealth | undefined> {
  let response: Response;
  try {
    response = await fetch(`${engineUrl(port)}/health`, { signal: AbortSignal.timeout(2000) });
  } catch (error) {
    if (connectionCode(error) !== undefined) return undefined;
    throw error;
  }
  const parsed = v.safeParse(engineHealthSchema, await response.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError("port_in_use", `port ${port} is in use by something other than Automedia`);
  }
  return parsed.output;
}

/**
 * Finds the engine for `target`, starting one if none is running. An idle
 * engine that is out of date is replaced; a busy one is used as it is, so an
 * upgrade never cuts off another agent's export.
 */
export async function connectEngine(
  target: EngineTarget,
  launch: EngineLauncher,
  bundleDir = __dirname,
): Promise<EngineHealth> {
  let health = await readHealth(target.port);
  if (health && isOutdated(health, bundleDir)) {
    if (health.busy) {
      console.error(
        `automedia: engine ${health.version} is out of date but busy, so this client is using it`,
      );
    } else {
      await stopEngine(health, target.port);
      health = undefined;
    }
  }
  if (!health) {
    launch(target);
    health = await waitForEngine(target.port);
  }
  if (target.explicitLibrary && health.library !== target.library) {
    throw new AppError(
      "library_mismatch",
      `the engine on port ${target.port} serves ${health.library}, not ${target.library}; pass another --port to run a second engine`,
    );
  }
  return health;
}

/**
 * Another version is out of date. So is an older build of this install's
 * engine, which happens in a checkout after a rebuild. A different install
 * of the same version is not: replacing it would have the studio and a
 * checkout's relays stop each other's engines in turn.
 */
function isOutdated(health: EngineHealth, bundleDir: string): boolean {
  if (health.version !== engineVersion) return true;
  const bundle = engineBundle(bundleDir);
  if (health.bundle !== bundle) return false;
  try {
    return statSync(bundle).mtimeMs !== health.builtAt;
  } catch {
    return false;
  }
}

export async function stopEngine(health: EngineHealth, port: number): Promise<void> {
  try {
    process.kill(health.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!(await readHealth(port).catch(() => undefined))) return;
    await sleep(100);
  }
  throw new AppError("engine_stuck", `the engine on port ${port} did not stop`);
}

async function waitForEngine(port: number): Promise<EngineHealth> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const health = await readHealth(port);
    if (health) return health;
    await sleep(100);
  }
  throw new AppError("engine_unavailable", `the engine did not start on port ${port}`);
}

/**
 * Runs the engine bundle beside this one under the current Node, detached so
 * it outlives the agent that started it. Its output goes to engine.log in
 * the library.
 */
export function launchDetachedEngine(target: EngineTarget): void {
  mkdirSync(target.library, { recursive: true });
  const logPath = path.join(target.library, "engine.log");
  const log = openSync(logPath, logSize(logPath) > maxLogBytes ? "w" : "a");
  const child = spawn(process.execPath, engineArgs(target), {
    detached: true,
    stdio: ["ignore", log, log],
    env: engineEnv(),
    windowsHide: true,
  });
  child.unref();
}

/** Past this, the next engine starts the log afresh. */
const maxLogBytes = 5 * 1024 * 1024;

function logSize(logPath: string): number {
  try {
    return statSync(logPath).size;
  } catch {
    return 0;
  }
}

export function engineBundle(bundleDir = __dirname): string {
  return path.join(bundleDir, "automedia-engine.js");
}

export function engineArgs(target: EngineTarget, bundleDir = __dirname): string[] {
  return [engineBundle(bundleDir), "--library", target.library, "--port", String(target.port)];
}

/** libuv's four default threads are shared by file I/O, zlib, and libav. */
export function engineEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_THREADPOOL_SIZE:
      process.env.UV_THREADPOOL_SIZE ?? String(Math.max(8, os.availableParallelism())),
  };
}

/**
 * The engine across HTTP. If the engine has gone (it exits when idle), the
 * call reconnects, which starts it again, and is sent once more: a refused
 * connection means the first attempt never arrived.
 */
export function remoteEngine(
  port: number,
  owner: string,
  reconnect: () => Promise<EngineHealth>,
): Engine {
  const post = <TName extends OperationName>(name: TName, input?: OperationInput<TName>) =>
    fetch(`${engineUrl(port)}/api/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", [ownerHeader]: owner },
      body: input === undefined ? "" : JSON.stringify(input),
    });
  return {
    call: async <TName extends OperationName>(
      name: TName,
      input?: OperationInput<TName>,
    ): Promise<OperationResult<TName>> => {
      let response: Response;
      try {
        response = await post(name, input);
      } catch (error) {
        if (connectionCode(error) !== "ECONNREFUSED") throw error;
        await reconnect();
        response = await post(name, input);
      }
      const reply = v.parse(apiReplySchema, await response.json());
      if (!reply.ok) throw new AppError(reply.error.code, reply.error.message);
      // SAFETY: the engine answered `name`, and its data is that operation's result.
      return reply.data as OperationResult<TName>;
    },
  };
}

/** fetch reports a failed connection as a TypeError caused by the socket error. */
function connectionCode(cause: unknown): "ECONNREFUSED" | "ECONNRESET" | undefined {
  const socketError = cause instanceof Error ? cause.cause : undefined;
  if (!(socketError instanceof Error) || !("code" in socketError)) return undefined;
  if (socketError.code === "ECONNREFUSED" || socketError.code === "ECONNRESET") {
    return socketError.code;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
