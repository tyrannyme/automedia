import { exportFormats, imageExtensions, mediaExtensions } from "./limits.ts";

export function isMediaExtension(value: string): value is (typeof mediaExtensions)[number] {
  return mediaExtensions.some((extension) => extension === value);
}

export function isImageExtension(value: string): value is (typeof imageExtensions)[number] {
  return imageExtensions.some((extension) => extension === value);
}

export function isAssetExtension(value: string): boolean {
  return isMediaExtension(value) || isImageExtension(value);
}

export function isExportFormat(value: string): value is (typeof exportFormats)[number] {
  return exportFormats.some((format) => format === value);
}

export function isDocumentKind(kind: string): boolean {
  return kind === "block" || kind === "music";
}

export function isBlockKind(kind: string): boolean {
  return kind === "block";
}

export function isMusicKind(kind: string): boolean {
  return kind === "music";
}

export function isImageKind(kind: string): boolean {
  return kind === "image";
}

export function isVideoKind(kind: string): boolean {
  return kind === "video";
}

export function isAssetKind(kind: string): boolean {
  return kind === "audio" || kind === "video";
}

export function isAudibleKind(kind: string): boolean {
  return kind === "audio" || kind === "video" || kind === "music";
}

export function isCompositorLayerKind(kind: string): boolean {
  return isDocumentKind(kind) || isImageKind(kind) || isVideoKind(kind);
}

export function mediaPrepareCount(tracks: readonly { kind: string }[]): number {
  return tracks.filter((track) => isAssetKind(track.kind)).length;
}

export function audibleAssetTracks<T extends { kind: string; mute: boolean }>(
  tracks: readonly T[],
): T[] {
  return tracks.filter((track) => isAssetKind(track.kind) && !track.mute);
}

export function audibleMusicTracks<T extends { kind: string; mute: boolean }>(
  tracks: readonly T[],
): T[] {
  return tracks.filter((track) => track.kind === "music" && !track.mute);
}

export function exportExpectsAudio(tracks: readonly { kind: string; mute: boolean }[]): boolean {
  return audibleAssetTracks(tracks).length > 0 || audibleMusicTracks(tracks).length > 0;
}

export function isVideoExportFormat(format: string): format is "mp4" | "webm" {
  return format === "mp4" || format === "webm";
}

export function isStillExportFormat(format: string): format is "png" | "gif" | "webp" {
  return format === "png" || format === "gif" || format === "webp";
}

export function isAudioExportFormat(format: string): format is "mp3" | "wav" | "ogg" {
  return format === "mp3" || format === "wav" || format === "ogg";
}

export function exportNeedsQuality(format: string): boolean {
  return (
    format === "mp4" ||
    format === "webm" ||
    format === "webp" ||
    format === "mp3" ||
    format === "ogg"
  );
}

export function exportNeedsFfmpeg(format: string): boolean {
  return format !== "png";
}
