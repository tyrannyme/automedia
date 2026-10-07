import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Finds `name` beside this module or in its nearest ancestor. The engine runs
 * from source in tests, from .vite/build in a checkout, and from
 * app.asar.unpacked/.vite/build in the packaged app, so install-relative files
 * are found by walking up rather than from one fixed root.
 */
export function findUp(name: string, from = __dirname): string | undefined {
  let directory = from;
  for (;;) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
