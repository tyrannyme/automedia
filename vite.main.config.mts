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
      external: ["electron", "playwright", /^playwright\//],
    },
  },
});
