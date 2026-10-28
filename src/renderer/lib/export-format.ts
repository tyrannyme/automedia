import type { Composition, ExportFormat, MediaTrack } from "@shared/schemas.ts";
import { frameCount, frameFromTime } from "@shared/clock.ts";
import {
  audibleAssetTracks,
  audibleMusicTracks,
  exportExpectsAudio,
  exportNeedsQuality,
  isAudioExportFormat,
  isVideoExportFormat,
} from "@shared/media.ts";
import { limits } from "@shared/limits.ts";
import { clipLabel } from "./timeline-math.ts";

export const exportFormatGroups = [
  { id: "video", label: "Video", formats: ["mp4", "webm"] },
  { id: "still", label: "Still", formats: ["png", "gif", "webp"] },
  { id: "audio", label: "Audio", formats: ["mp3", "wav", "ogg"] },
] as const satisfies readonly {
  id: string;
  label: string;
  formats: readonly ExportFormat[];
}[];

export type ExportFormatGroupId = (typeof exportFormatGroups)[number]["id"];

export function exportFormatLabel(format: ExportFormat): string {
  if (format === "mp4") return "MP4";
  if (format === "webm") return "WebM";
  if (format === "webp") return "WebP";
  return format.toUpperCase();
}

/** Sample rate and channels of every mix the engine writes (export-audio.ts). */
export const exportSampleRate = 48_000;
const exportChannels = 2;
/** RIFF, fmt and data chunk headers of a plain 16-bit PCM WAV. */
const wavHeaderBytes = 44;
/** Mirrors maxAnimatedWebpBytes in animation-encode.ts; a test keeps them equal. */
export const maxAnimatedWebpFrameBytes = 1.5 * 1024 ** 3;

/**
 * The bitrate the engine encodes at, in kbps (export-audio.ts audioEncoding).
 * MP4 and WebM sound is fixed; MP3 and OGG follow quality. WAV has none.
 */
export function exportAudioKbps(format: ExportFormat, quality = 80): number | null {
  if (format === "mp4") return 192;
  if (format === "webm") return 160;
  if (format === "mp3")
    return Math.round((64_000 + Math.round((quality - 1) * (256_000 / 99))) / 1000);
  if (format === "ogg")
    return Math.round((64_000 + Math.round((quality - 1) * (436_000 / 99))) / 1000);
  return null;
}

type ExportSubject = Pick<
  Composition,
  "name" | "width" | "height" | "fps" | "durationSeconds" | "background"
>;
type ExportTracks = readonly Pick<MediaTrack, "kind" | "mute" | "name" | "asset">[];

/** A fix the sheet can apply in one click. */
export type ExportFix = { kind: "background" } | { kind: "size"; width: number; height: number };

export type ExportBlock = { title: string; detail: string; fix?: ExportFix };

function evenSide(value: number): number {
  if (value % 2 === 0) return value;
  return value - 1 >= Math.max(2, limits.minSize) ? value - 1 : value + 1;
}

/** The nearest even size at or under an odd one, staying inside the engine's limits. */
export function nearestEvenSize(width: number, height: number) {
  return { width: evenSide(width), height: evenSide(height) };
}

/** Why MP4 and WebM cannot export this composition, or null when they can. */
export function videoBlock(composition: ExportSubject | null): ExportBlock | null {
  if (!composition) return null;
  if (composition.background === "transparent") {
    return {
      title: "Video needs an opaque background.",
      detail: `${composition.name} is transparent. A still keeps the alpha.`,
      fix: { kind: "background" },
    };
  }
  if (composition.width % 2 !== 0 || composition.height % 2 !== 0) {
    const size = nearestEvenSize(composition.width, composition.height);
    return {
      title: "Video needs an even width and height.",
      detail: `This composition is ${composition.width} × ${composition.height}.`,
      fix: { kind: "size", ...size },
    };
  }
  return null;
}

/** The old one-line reason, kept for callers that only need a sentence. */
export function videoExportBlock(composition: ExportSubject | null): string | null {
  const block = videoBlock(composition);
  return block ? `${block.title} ${block.detail}` : null;
}

/** Why animated WebP cannot hold this composition, or null when it can. */
export function webpBlock(composition: ExportSubject | null): ExportBlock | null {
  if (!composition) return null;
  const frames = frameCount(composition.durationSeconds, composition.fps);
  if (frames * composition.width * composition.height * 4 <= maxAnimatedWebpFrameBytes) {
    return null;
  }
  return {
    title: "Too many frames for animated WebP.",
    detail: "Shorten it, lower its size or frame rate, or export GIF or video.",
  };
}

/** Why the audio formats have nothing to export, or null when they do. */
export function audioBlock(tracks: ExportTracks | null): ExportBlock | null {
  if (!tracks || exportExpectsAudio(tracks)) return null;
  return {
    title: "No sound to export.",
    detail: "Audio needs an unmuted audio, video, or music track.",
  };
}

export type ExportBlocks = {
  video: ExportBlock | null;
  webp: ExportBlock | null;
  audio: ExportBlock | null;
};

export function exportBlocks(
  composition: ExportSubject | null,
  tracks: ExportTracks | null,
): ExportBlocks {
  return {
    video: videoBlock(composition),
    webp: webpBlock(composition),
    audio: audioBlock(tracks),
  };
}

export function exportFormatBlock(format: ExportFormat, blocks: ExportBlocks): ExportBlock | null {
  if (isVideoExportFormat(format)) return blocks.video;
  if (isAudioExportFormat(format)) return blocks.audio;
  if (format === "webp") return blocks.webp;
  return null;
}

export function exportFormatDisabled(
  format: ExportFormat,
  options: { videoBlocked: boolean },
): boolean {
  return options.videoBlocked && isVideoExportFormat(format);
}

/** The format the sheet opens on: the last one used, or the best one that works. */
export function defaultExportFormat(last: ExportFormat, blocks: ExportBlocks): ExportFormat {
  if (!exportFormatBlock(last, blocks)) return last;
  if (blocks.video) return blocks.webp ? "png" : "webp";
  return "mp4";
}

/** Slider label: WebP is lossless, so its number is encoder effort, not quality. */
export function exportQualityLabel(format: ExportFormat): string | null {
  if (!exportNeedsQuality(format)) return null;
  return format === "webp" ? "Effort (smaller file, slower)" : "Quality";
}

/** Names of the tracks an audio export mixes, for the group note. */
export function audibleTrackNames(tracks: ExportTracks): string[] {
  return [...audibleAssetTracks(tracks), ...audibleMusicTracks(tracks)].map((track) =>
    clipLabel(track),
  );
}

export function exportGroupNote(
  group: ExportFormatGroupId,
  context: { transparent: boolean; audible: readonly string[] },
): string {
  if (group === "video") return context.audible.length > 0 ? "picture and sound" : "picture only";
  if (group === "still") return context.transparent ? "keeps transparency" : "no sound";
  const [first, ...rest] = context.audible;
  if (!first) return "";
  return rest.length === 0 ? `the ${first} track` : `${context.audible.length} tracks`;
}

export type ExportSpecContext = {
  composition: Pick<Composition, "width" | "height" | "fps" | "durationSeconds" | "background">;
  hasSound: boolean;
  quality: number;
  playheadSeconds: number;
};

function seconds(value: number): string {
  return `${value.toFixed(1)} s`;
}

/** The codec line under each option, in DM Mono. */
export function exportFormatLine(format: ExportFormat, context: ExportSpecContext): string {
  const { composition, hasSound, quality } = context;
  const frames = frameCount(composition.durationSeconds, composition.fps);
  const transparent = composition.background === "transparent";
  if (format === "mp4") return hasSound ? "H.264 + AAC · plays anywhere" : "H.264 · plays anywhere";
  if (format === "webm") return hasSound ? "VP9 + Opus · for the web" : "VP9 · for the web";
  if (format === "png") {
    const frame = frameFromTime(
      context.playheadSeconds,
      composition.fps,
      composition.durationSeconds,
    );
    return `frame ${frame} · the playhead`;
  }
  if (format === "gif") return `${frames} frames · ${transparent ? "hard edges" : "256 colours"}`;
  if (format === "webp") return `${frames} frames · lossless${transparent ? " · alpha" : ""}`;
  if (format === "wav") return "48 kHz · lossless";
  const kbps = exportAudioKbps(format, quality);
  return format === "mp3"
    ? `${kbps} kbps · ${seconds(composition.durationSeconds)}`
    : `Vorbis · ${kbps} kbps`;
}

/** The spec line under the file you will get. */
export function exportSpecLine(format: ExportFormat, context: ExportSpecContext): string {
  const { composition, hasSound, quality } = context;
  const size = `${composition.width} × ${composition.height}`;
  const fps = `${composition.fps} fps`;
  const length = seconds(composition.durationSeconds);
  const transparent = composition.background === "transparent";
  const parts: string[] = [];
  if (format === "mp4") parts.push(hasSound ? "H.264 + AAC" : "H.264", size, fps, length);
  else if (format === "webm") parts.push(hasSound ? "VP9 + Opus" : "VP9", size, fps, length);
  else if (format === "png")
    parts.push(
      ...(transparent ? ["alpha"] : []),
      size,
      exportFormatLine("png", context).split(" · ")[0] ?? "",
    );
  else if (format === "gif")
    parts.push(transparent ? "hard edges" : "256 colours", size, fps, length);
  else if (format === "webp")
    parts.push(`lossless${transparent ? " · alpha" : ""}`, size, fps, length);
  else if (format === "wav") parts.push("PCM 16-bit · 48 kHz stereo", length);
  else
    parts.push(
      `${format === "mp3" ? "MP3" : "Vorbis"} · ${exportAudioKbps(format, quality)} kbps · 48 kHz`,
      length,
    );
  if (format === "webp") parts.push(`effort ${quality}`);
  else if (exportNeedsQuality(format) && !isAudioExportFormat(format))
    parts.push(`quality ${quality}`);
  return parts.join(" · ");
}

/**
 * The size of the file, where the engine's settings fix it exactly. Only WAV
 * qualifies: 16-bit stereo PCM at 48 kHz plus a 44-byte header. Everything
 * else depends on the picture, so the sheet shows no number for it.
 */
export function exactExportBytes(
  format: ExportFormat,
  composition: Pick<Composition, "durationSeconds">,
): number | null {
  if (format !== "wav") return null;
  const samples = Math.round(composition.durationSeconds * exportSampleRate);
  return wavHeaderBytes + samples * exportChannels * 2;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

/** What the engine's verify step checked, for the receipt. */
export function exportChecks(format: ExportFormat, hasSound: boolean): string | null {
  if (isVideoExportFormat(format)) {
    return hasSound ? "codec, size, rate, length, sound" : "codec, size, rate, length";
  }
  if (isAudioExportFormat(format)) return "codec, length";
  return null;
}

/** "now", "6m ago", "1h ago", "2d ago". */
export function exportAge(mtimeMs: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - mtimeMs) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The receipt's sound line. */
export function exportSoundLine(format: ExportFormat, quality = 80): string | null {
  if (format === "wav") return "PCM 16-bit · 48 kHz";
  const kbps = exportAudioKbps(format, quality);
  if (kbps === null) return null;
  const codec =
    format === "mp4" ? "AAC" : format === "webm" ? "Opus" : format === "mp3" ? "MP3" : "Vorbis";
  return `${codec} · ${kbps} kbps · 48 kHz`;
}
