import os from "node:os";
import { runDaemon } from "./daemon.ts";
import { parseCli } from "./options.ts";

// Before the first file, zlib, or libav call: libuv's pool is sized once.
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(8, os.availableParallelism()));

runDaemon(parseCli(process.argv.slice(2))).catch((error) => {
  console.error("automedia: engine failed", error);
  process.exit(1);
});
