import * as v from "valibot";
import { isBlockKind, isMusicKind } from "./media.ts";
import {
  isManagedMusicRuntimePath,
  musicPatternPath,
  normalizeCompositionPath,
} from "./music-paths.ts";
import type { Composition } from "./schemas.ts";

export const projectArchiveKind = "automedia.composition";
export const projectArchiveFormat = 1;
export const projectArchiveExtension = "automedia";
export const projectArchiveManifestName = "automedia.json";
export const projectArchiveThumbnailPath = ".automedia/thumbnail.png";

export const projectArchiveCatalogSchema = v.object({
  three: v.string(),
  tailwindBrowser: v.string(),
  motion: v.string(),
  strudel: v.string(),
  vgpu: v.optional(v.string()),
});

export const projectArchiveManifestSchema = v.object({
  kind: v.literal(projectArchiveKind),
  format: v.literal(projectArchiveFormat),
  appVersion: v.string(),
  catalog: projectArchiveCatalogSchema,
});

export const projectArchiveManifestEnvelopeSchema = v.object({
  kind: v.string(),
  format: v.number(),
});

export type ProjectArchiveCatalog = v.InferOutput<typeof projectArchiveCatalogSchema>;
export type ProjectArchiveManifest = v.InferOutput<typeof projectArchiveManifestSchema>;

export type ImportProjectResult = {
  composition: Composition;
  catalogMismatch: boolean;
};

export function projectArchiveFileName(name: string): string {
  const unsafe = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  const safe = [...name]
    .filter((char) => {
      const code = char.codePointAt(0);
      if (code === undefined || code < 32) return false;
      return !unsafe.has(char);
    })
    .join("")
    .replaceAll(/[. ]+$/g, "")
    .trim();
  return `${safe.length > 0 ? safe : "Untitled"}.${projectArchiveExtension}`;
}

export function ensureProjectArchiveExtension(filePath: string): string {
  return filePath.endsWith(`.${projectArchiveExtension}`)
    ? filePath
    : `${filePath}.${projectArchiveExtension}`;
}

export function catalogsMatch(
  saved: ProjectArchiveCatalog,
  current: ProjectArchiveCatalog,
): boolean {
  return (
    saved.three === current.three &&
    saved.tailwindBrowser === current.tailwindBrowser &&
    saved.motion === current.motion &&
    saved.strudel === current.strudel &&
    saved.vgpu === current.vgpu
  );
}

export function isDeniedProjectPath(relativePath: string): boolean {
  const normalized = normalizeCompositionPath(relativePath);
  if (normalized === ".agent-activity.jsonl") return true;
  if (normalized === "exports" || normalized.startsWith("exports/")) return true;
  if (isManagedMusicRuntimePath(normalized)) return true;
  if (normalized === projectArchiveThumbnailPath) return false;
  if (normalized === projectArchiveManifestName) return false;
  return normalized.split("/").some((part) => part.startsWith("."));
}

export function skipArchiveDirectory(relativePath: string): boolean {
  const normalized = normalizeCompositionPath(relativePath);
  if (normalized === "exports" || normalized.startsWith("exports/")) return true;
  if (normalized === ".automedia") return false;
  return normalized.split("/").some((part) => part.startsWith("."));
}

export function shouldCompressArchivePath(relativePath: string): boolean {
  return !/\.(png|jpe?g|gif|webp|mp4|webm|mov|mkv|mp3|wav|ogg|opus|aac|flac|m4a)$/i.test(
    normalizeCompositionPath(relativePath),
  );
}

export function projectTrackSourcePath(track: { kind: string; asset: string }): string {
  if (isMusicKind(track.kind)) return musicPatternPath(track.asset);
  if (isBlockKind(track.kind)) return `blocks/${track.asset}/index.html`;
  return `assets/${track.asset}`;
}
