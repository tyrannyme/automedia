import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { clipsOverlap, laneAccepts, nextLane } from "@shared/clips.ts";
import type { CompositionStore } from "../store.ts";
import type { Composition, Control, MediaTrack, UpdateSettingsInput } from "@shared/schemas.ts";

export type ExampleSpec = {
  name: string;
  description: string;
  settings?: Omit<UpdateSettingsInput, "compositionId">;
  body: string;
  css: string;
  js: string;
  controls?: Control[];
  tracks?: MediaTrack[];
  media?: boolean;
  files?: Record<string, string>;
};

export const htmlShell = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    ${body}
    <script type="module" src="script.js"></script>
  </body>
</html>
`;

export async function writeSpec(store: CompositionStore, spec: ExampleSpec): Promise<Composition> {
  const composition = await store.create(spec.name);
  if (spec.settings) {
    await store.updateSettings({ compositionId: composition.id, ...spec.settings });
  }
  const block = await store.createBlock(composition.id, spec.name);
  const intended = spec.settings?.durationSeconds;
  if (intended !== undefined && Math.abs(block.duration - intended) > 1e-6) {
    await store.putTrack(composition.id, { ...block, duration: intended });
  }
  const htmlPath = `blocks/${block.asset}/index.html`;
  const cssPath = `blocks/${block.asset}/style.css`;
  const jsPath = `blocks/${block.asset}/script.js`;
  await store.deleteFile(composition.id, htmlPath);
  await store.deleteFile(composition.id, cssPath);
  await store.deleteFile(composition.id, jsPath);
  await store.writeFile(composition.id, htmlPath, "utf8", htmlShell(spec.name, spec.body), "");
  await store.writeFile(composition.id, cssPath, "utf8", spec.css, "");
  await store.writeFile(composition.id, jsPath, "utf8", spec.js, "");
  for (const [name, content] of Object.entries(spec.files ?? {})) {
    await store.writeFile(composition.id, `blocks/${block.asset}/${name}`, "utf8", content, "");
  }
  if (spec.media) {
    await copyMediaFixtures(store.compositionDir(composition.id));
  }
  for (const track of spec.tracks ?? []) {
    const current = await store.getMedia(composition.id);
    const taken = current.tracks.some(
      (existing) =>
        existing.id !== track.id &&
        existing.lane === track.lane &&
        (existing.kind !== track.kind || clipsOverlap(existing, track)),
    );
    const next =
      taken || !laneAccepts(current.tracks, track.lane, track.kind)
        ? { ...track, lane: nextLane(current.tracks) }
        : track;
    await store.putTrack(composition.id, next);
  }
  for (const control of spec.controls ?? []) {
    await store.putControl(composition.id, control);
  }
  return store.get(composition.id);
}

function fixtureRoot(): string {
  // Keep this based on filesystem/runtime paths rather than import.meta.url. Vite's
  // main-process transform does not preserve import.meta.url in the Electron bundle;
  // in the built app it becomes an object placeholder and `new URL(...)` throws
  // "Invalid URL" when the first media-backed example is created.
  const candidates = [path.join(process.cwd(), "fixtures")];
  if (process.resourcesPath !== undefined) {
    candidates.push(path.join(process.resourcesPath, "fixtures"));
  }
  const root = candidates.find((candidate) => existsSync(candidate));
  if (root) return root;
  throw new Error("media fixtures are not available in this installation");
}

export async function copyMediaFixtures(compositionDir: string): Promise<void> {
  const sourceDir = fixtureRoot();
  const assetsDir = path.join(compositionDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await copyFile(path.join(sourceDir, "fps-guns.mp4"), path.join(assetsDir, "fps-guns.mp4"));
  await copyFile(path.join(sourceDir, "beat-ident.ogg"), path.join(assetsDir, "beat-ident.ogg"));
}
