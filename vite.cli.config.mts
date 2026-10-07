import { builtinModules } from "node:module";
import { defineConfig, mergeConfig } from "vite";
import main from "./vite.main.config.mts";

/**
 * Builds the `automedia` command without packaging the studio. Each bundle is
 * built on its own, as Electron Forge does, so the relay never shares a chunk
 * with the engine: `vite build -c vite.cli.config.mts --mode <bundle>`.
 */
const bundles = {
  automedia: "src/cli/automedia.ts",
  "automedia-engine": "src/cli/automedia-engine.ts",
  "codec-worker": "src/engine/codec-worker.ts",
} as const;

export default defineConfig(({ mode }) => {
  const entry = Object.entries(bundles).find(([name]) => name === mode)?.[1];
  if (!entry) throw new Error(`--mode must be one of ${Object.keys(bundles).join(", ")}`);
  return mergeConfig(main, {
    build: {
      outDir: ".vite/build",
      emptyOutDir: false,
      minify: true,
      lib: { entry, fileName: () => `${mode}.js`, formats: ["cjs"] },
      rollupOptions: {
        external: builtinModules.flatMap((name) => [name, `node:${name}`]),
      },
    },
    resolve: {
      conditions: ["node"],
      mainFields: ["module", "jsnext:main", "jsnext"],
    },
  });
});
