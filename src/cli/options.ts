import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { loopbackPort } from "@shared/limits.ts";
import { resolvePort } from "@shared/ports.ts";

/** Where an engine listens and which library it serves. */
export type EngineTarget = {
  port: number;
  library: string;
  /** Set when the caller named a library, so a different one is an error. */
  explicitLibrary: boolean;
};

export type CliOptions = {
  command: string;
  target: EngineTarget;
  /** 0 keeps the engine running until it is stopped. */
  idleMinutes: number;
  exportSlots?: number | undefined;
  renderSlots?: number | undefined;
  help: boolean;
  version: boolean;
};

/**
 * The library the studio has always used: Electron's userData directory for
 * Automedia, so existing compositions carry over.
 */
export function defaultLibrary(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Automedia");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Automedia");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "Automedia");
}

export function parseCli(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      library: { type: "string" },
      port: { type: "string" },
      "idle-minutes": { type: "string" },
      "export-slots": { type: "string" },
      "render-slots": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const library = values.library ?? process.env.AUTOMEDIA_LIBRARY;
  return {
    command: positionals[0] ?? "",
    target: {
      port: resolvePort(values.port ?? process.env.AUTOMEDIA_LOOPBACK_PORT, loopbackPort),
      library: path.resolve(library ?? defaultLibrary()),
      explicitLibrary: library !== undefined,
    },
    idleMinutes: count(values["idle-minutes"], "--idle-minutes") ?? 30,
    exportSlots: positive(values["export-slots"], "--export-slots"),
    renderSlots: positive(values["render-slots"], "--render-slots"),
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

function count(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} must be 0 or more`);
  return value;
}

function positive(raw: string | undefined, flag: string): number | undefined {
  const value = count(raw, flag);
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new Error(`${flag} must be a whole number of at least 1`);
  }
  return value;
}

export const usage = `Usage: automedia <command> [options]

Commands:
  mcp      Speak MCP over stdio for one agent. Starts the shared engine if it
           is not running, and stays a small relay to it.
  daemon   Run the engine in the foreground.
  status   Show the running engine, if any.
  stop     Stop the running engine.

Options:
  --library <dir>       Library to serve (default: the studio's library,
                        or AUTOMEDIA_LIBRARY)
  --port <n>            Engine port (default: 47821, or AUTOMEDIA_LOOPBACK_PORT)
  --idle-minutes <n>    daemon: exit after this long with no requests, work,
                        or open studio (default: 30; 0 never exits)
  --export-slots <n>    daemon: exports that run at once (default: cores / 6)
  --render-slots <n>    daemon: validations and thumbnails that run at once
                        (default: cores / 4, between 2 and 6)
  -v, --version         Print the version
  -h, --help            Print this help
`;
