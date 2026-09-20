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
