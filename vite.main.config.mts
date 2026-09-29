import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(root, "src/shared"),
    },
  },
  build: {
    rollupOptions: {
      // Mediabunny stays bundled so its encoder registry is one instance.
      // node-av loads a native addon and wasm-webp reads its .wasm beside
      // itself, so both load from node_modules at runtime.
      external: [
        "electron",
        "playwright",
        /^playwright\//,
        "node-av",
        /^node-av\//,
        /^wasm-webp\//,
      ],
    },
  },
});
