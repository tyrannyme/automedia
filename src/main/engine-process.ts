import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { AppError } from "@shared/errors.ts";
import {
  connectEngine,
  engineArgs,
  engineEnv,
  remoteEngine,
  type EngineTarget,
} from "../cli/client.ts";
import type { Engine } from "../engine/operations.ts";

/** The engine needs Node for x264, which aborts inside Electron's allocator. */
const minimumNode = [22, 18] as const;

export type StudioEngine = {
  engine: Engine;
  port: number;
  /** Stops the engine if this studio started it. */
  close: () => Promise<void>;
};

/**
 * Uses the engine already serving this library, as when agents started it,
 * or starts one. One the studio starts lives only as long as the studio:
 * its files may sit inside the AppImage mount, which goes when the app quits.
 * Agents' relays start their own when they next call.
 */
export async function connectStudioEngine(target: EngineTarget): Promise<StudioEngine> {
  let child: ChildProcess | undefined;
  const bundleDir = unpackedBundleDir();
  const launch = (launchTarget: EngineTarget) => {
    child = spawn(nodeBinary(), engineArgs(launchTarget, bundleDir), {
      stdio: ["ignore", "inherit", "inherit"],
      env: engineEnv(),
      windowsHide: true,
    });
  };
  const connect = () => connectEngine(target, launch, bundleDir);
  await connect();
  return {
    engine: remoteEngine(target.port, "studio", connect),
    port: target.port,
    close: async () => {
      const running = child;
      if (!running || running.exitCode !== null) return;
      const exited = new Promise((resolve) => running.once("exit", resolve));
      running.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    },
  };
}

/** Node from AUTOMEDIA_NODE or PATH, checked before the engine is launched. */
function nodeBinary(): string {
  const binary = process.env.AUTOMEDIA_NODE ?? "node";
  const result = spawnSync(binary, ["--version"], { encoding: "utf8", windowsHide: true });
  const [major = 0, minor = 0] = (result.stdout ?? "")
    .trim()
    .replace(/^v/, "")
    .split(".")
    .map(Number);
  const [needMajor, needMinor] = minimumNode;
  if (result.error || major < needMajor || (major === needMajor && minor < needMinor)) {
    throw new AppError(
      "node_missing",
      `Automedia runs its engine with Node.js ${needMajor}.${needMinor} or newer. Install it on PATH, or point AUTOMEDIA_NODE at it.`,
    );
  }
  return binary;
}

/** System Node cannot read inside app.asar; the engine bundles are unpacked beside it. */
function unpackedBundleDir(): string {
  return __dirname.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}
