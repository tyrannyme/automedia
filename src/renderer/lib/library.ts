import { nextFreeStart, preferredLane } from "@shared/clips.ts";
import { limits } from "@shared/limits.ts";
import { isImageExtension } from "@shared/media.ts";
import type { MediaTrack } from "@shared/schemas.ts";

const videoExtensions = new Set(["mkv", "mov", "mp4", "webm"]);

export function fileExtension(asset: string): string {
  const dot = asset.lastIndexOf(".");
  if (dot < 0) return "";
  return asset.slice(dot + 1).toLowerCase();
}

export function isVideoLibraryAsset(asset: string): boolean {
  return videoExtensions.has(fileExtension(asset));
}

export function isImageLibraryAsset(asset: string): boolean {
  return isImageExtension(fileExtension(asset));
}

export function imageTrackFromLibrary(input: {
  id: string;
  asset: string;
  playheadSeconds: number;
  tracks: readonly MediaTrack[];
  selectedTrackId: string | null;
  lane?: number | undefined;
}): MediaTrack {
  const kind = "image";
  const duration = limits.defaultBlockSeconds;
  const selectedTrack = input.tracks.find((track) => track.id === input.selectedTrackId);
  const lane = preferredLane(
    input.tracks,
    kind,
    input.lane ?? (selectedTrack?.kind === kind ? selectedTrack.lane : undefined),
  );
  return {
    id: input.id,
    asset: input.asset,
    kind,
    start: nextFreeStart(input.tracks, lane, input.playheadSeconds, duration),
    trimStart: 0,
    rate: 1,
    volume: 1,
    mute: true,
    duration,
    lane,
  };
}

/** The project's media: files under assets/, by name. */
export function libraryAssets(files: readonly string[]): string[] {
  return files.filter((file) => file.startsWith("assets/")).map((file) => file.slice(7));
}

export type LibraryAssetKind = "video" | "image" | "audio";

export function libraryAssetKind(asset: string): LibraryAssetKind {
  if (isVideoLibraryAsset(asset)) return "video";
  if (isImageLibraryAsset(asset)) return "image";
  return "audio";
}

/** "240 KB", "3.3 MB": decimal units, one decimal under ten. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1000) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 999.5 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 9.95 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "4.93 s", "1:02.5": a media length for meta lines. */
export function formatMediaLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}
