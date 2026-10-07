import { startEngine, type RunningEngine } from "../engine/engine.ts";
import { engineVersion } from "../engine/version.ts";
import { readHealth } from "./client.ts";
import type { CliOptions } from "./options.ts";

const idleCheckMs = 30_000;

/**
 * Runs the engine until it is stopped, or until it has been idle for
 * `idleMinutes`: no requests, no work, and no studio watching. Relays start
 * it again on their next call.
 */
export async function runDaemon(options: CliOptions): Promise<void> {
  const { target } = options;
  let lastRequest = Date.now();
  let engine: RunningEngine;
  try {
    engine = await startEngine(target.library, {
      port: target.port,
      pool: { heavySlots: options.exportSlots, lightSlots: options.renderSlots },
      onRequest: () => {
        lastRequest = Date.now();
      },
    });
  } catch (error) {
    // Two relays can start an engine at once; the one that lost the port
    // leaves quietly when the winner is an Automedia engine.
    const running = await readHealth(target.port).catch(() => undefined);
    if (running) {
      console.error(`automedia: engine ${running.version} already serves port ${target.port}`);
      return;
    }
    throw error;
  }
  console.error(
    `automedia: engine ${engineVersion} serving ${target.library} at ${engine.server.url}`,
  );

  let stopping = false;
  const stop = (reason: string) => {
    if (stopping) return;
    stopping = true;
    clearInterval(idleCheck);
    console.error(`automedia: stopping (${reason})`);
    void engine.close().finally(() => process.exit(0));
  };
  const idleMs = options.idleMinutes * 60_000;
  const idleCheck = setInterval(() => {
    if (idleMs === 0 || engine.events.viewers > 0 || engine.busy()) return;
    if (Date.now() - lastRequest >= idleMs) stop("idle");
  }, idleCheckMs);
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
}
