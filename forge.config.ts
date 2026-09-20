import { cp } from "node:fs/promises";
import path from "node:path";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerAppImage } from "./forge/maker-appimage.ts";

const runtimePackages = [
  "playwright",
  "playwright-core",
  "three",
  "motion",
  "motion-dom",
  "motion-utils",
  "framer-motion",
  "@tailwindcss/browser",
  "@strudel/web",
  "vgpu",
  "@vgpu/core",
  "@vgpu/wgsl",
];

function copyRuntimePackages(
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (error?: Error | null) => void,
): void {
  void Promise.all(
    runtimePackages.map((name) =>
      cp(
        path.join(process.cwd(), "node_modules", name),
        path.join(buildPath, "node_modules", name),
        { recursive: true, dereference: true },
      ),
    ),
  ).then(() => callback(), callback);
}

const config: ForgeConfig = {
  packagerConfig: {
    extraResource: ["fixtures", "assets/icon.png"],
    asar: {
      unpack:
        "{.vite/build/main.js,**/node_modules/{playwright,playwright-core,three,motion,motion-dom,motion-utils,framer-motion,vgpu,@tailwindcss,@strudel,@vgpu}/**}",
    },
    executableName: "automedia",
    icon: "assets/icon",
    prune: false,
    derefSymlinks: true,
    afterCopy: [copyRuntimePackages],
  },
  rebuildConfig: {},
  makers: [new MakerAppImage({}), new MakerZIP({})],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
