import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Finds `name` beside this module or in its nearest ancestor. The engine runs
 * from source in tests, from cli/ after `pnpm build:cli` or in a `pnpx` install, and from
 * app.asar.unpacked/.vite/build in the packaged app, so install-relative files
 * are found by walking up rather than from one fixed root. Under `pnpx`,
 * dependencies are siblings of the package in node_modules, which the walk
 * also reaches.
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
