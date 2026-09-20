import path from "node:path";
import { app } from "electron";
import { AppError } from "@shared/errors.ts";
import type { Control, MediaTrack } from "@shared/schemas.ts";
import { runtimeTypes } from "@shared/runtime-types.ts";
import { controllerSource } from "./runtime-controller.ts";

export { controllerSource };

export const runtimeCatalog = {
  three: "0.185.1",
  tailwindBrowser: "4.3.3",
  motion: "13.1.0",
  strudel: "1.2.8",
  vgpu: "0.3.0",
} as const;

export type RuntimeCatalog = typeof runtimeCatalog;

export function packageRoot(name: string): string {
  const appPath = app?.getAppPath?.() ?? process.cwd();
  const unpackedRoot = appPath.endsWith(".asar") ? `${appPath}.unpacked` : appPath;
  return path.join(unpackedRoot, "node_modules", name);
}

export function runtimeAssetRoots() {
  return {
    three: packageRoot("three"),
    motion: packageRoot("motion"),
    "motion-dom": packageRoot("motion-dom"),
    "motion-utils": packageRoot("motion-utils"),
    "framer-motion": packageRoot("framer-motion"),
    "@tailwindcss/browser": packageRoot("@tailwindcss/browser"),
    "@strudel/web": packageRoot("@strudel/web"),
    vgpu: packageRoot("vgpu"),
    "@vgpu/core": packageRoot("@vgpu/core"),
    "@vgpu/wgsl": packageRoot("@vgpu/wgsl"),
  } as const;
}

export function runtimeAssetRoot(library: string): string {
  const roots = runtimeAssetRoots();
  for (const [key, value] of Object.entries(roots)) {
    if (key === library) {
      return value;
    }
  }
  throw new AppError("not_found", `unknown runtime library ${library}`);
}

export function importMapJson(): string {
  return JSON.stringify({
    imports: {
      three: "/runtime/assets/three/build/three.module.js",
      "three/addons/": "/runtime/assets/three/examples/jsm/",
      motion: "/runtime/assets/motion/dist/es/index.mjs",
      "motion-dom": "/runtime/assets/motion-dom/dist/es/index.mjs",
      "motion-utils": "/runtime/assets/motion-utils/dist/es/index.mjs",
      "framer-motion": "/runtime/assets/framer-motion/dist/es/index.mjs",
      "framer-motion/dom": "/runtime/assets/framer-motion/dist/es/dom.mjs",
      "@strudel/web": "/runtime/assets/@strudel/web/dist/index.mjs",
      vgpu: "/runtime/assets/vgpu/dist/index.js",
      "vgpu/scene": "/runtime/assets/vgpu/dist/scene.js",
      "vgpu/core": "/runtime/assets/vgpu/dist/core.js",
      "@vgpu/core": "/runtime/assets/@vgpu/core/dist/index.js",
      "@vgpu/wgsl": "/runtime/assets/@vgpu/wgsl/dist/index.js",
      "@vgpu/wgsl/reflect-source": "/runtime/assets/@vgpu/wgsl/dist/runtime/reflect-source.js",
    },
  });
}

export function getRuntimeTypes(): string {
  return runtimeTypes;
}

export function injectRuntime(
  html: string,
  composition: {
    id?: string;
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    background: string;
  },
  documents: {
    tracks: MediaTrack[];
    controls: Control[];
  } = {
    tracks: [],
    controls: [],
  },
): string {
  const headInjection = [
    `<script type="importmap">${importMapJson()}</script>`,
    `<script src="/runtime/assets/@tailwindcss/browser/dist/index.global.js"></script>`,
    `<script>${controllerSource}</script>`,
    `<script type="application/json" id="automedia-documents">${JSON.stringify({
      compositionId: composition.id ?? "",
      tracks: documents.tracks,
      controls: documents.controls,
    }).replaceAll("<", "\\u003c")}</script>`,
  ].join("");

  const withHead = html.includes("</head>")
    ? html.replace("</head>", `${headInjection}</head>`)
    : `<head>${headInjection}</head>${html}`;

  const attributes = [
    `data-automedia-width="${composition.width}"`,
    `data-automedia-height="${composition.height}"`,
    `data-automedia-fps="${composition.fps}"`,
    `data-automedia-duration="${composition.durationSeconds}"`,
    `data-automedia-background="${composition.background}"`,
    `data-automedia-id="${composition.id ?? ""}"`,
  ].join(" ");

  if (withHead.includes("<html")) {
    return withHead.replace(/<html([^>]*)>/i, `<html$1 ${attributes}>`);
  }
  return `<html ${attributes}>${withHead}</html>`;
}
