import path from "node:path";
import { engineVersion } from "../engine/version.ts";
import { readHealth, stopEngine } from "./client.ts";
import { parseCli, usage, type CliOptions } from "./options.ts";
import { runRelay } from "./relay.ts";

/**
 * The `automedia` command. Kept small: an agent runs one `automedia mcp` per
 * session, and that relay must not load Chromium or libav. The engine lives
 * in automedia-engine.js.
 */
async function main(options: CliOptions): Promise<void> {
  if (options.version) {
    console.log(engineVersion);
    return;
  }
  if (options.help || options.command === "") {
    console.log(usage);
    return;
  }
  const { target } = options;
  if (options.command === "mcp") {
    runRelay(target);
    return;
  }
  if (options.command === "daemon") {
    // The engine bundle parses the same arguments and runs in this process.
    require(path.join(__dirname, "automedia-engine.js"));
    return;
  }
  if (options.command === "status") {
    const health = await readHealth(target.port);
    console.log(health ? JSON.stringify(health, null, 2) : `no engine on port ${target.port}`);
    return;
  }
  if (options.command === "stop") {
    const health = await readHealth(target.port);
    if (!health) {
      console.log(`no engine on port ${target.port}`);
      return;
    }
    await stopEngine(health, target.port);
    console.log(`stopped engine ${health.version} (pid ${health.pid})`);
    return;
  }
  console.error(`unknown command ${options.command}\n\n${usage}`);
  process.exitCode = 2;
}

void Promise.resolve()
  .then(() => main(parseCli(process.argv.slice(2))))
  .catch((error) => {
    console.error(`automedia: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
