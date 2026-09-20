import type { ExportFormat } from "@shared/schemas.ts";
import { exportNeedsFfmpeg, isAudioExportFormat, isVideoExportFormat } from "@shared/media.ts";

export const exportFormatGroups = [
  { id: "video", label: "Video", formats: ["mp4", "webm"] },
  { id: "still", label: "Still", formats: ["png", "gif", "webp"] },
  { id: "audio", label: "Audio", formats: ["mp3", "wav", "ogg"] },
] as const satisfies readonly {
  id: string;
  label: string;
  formats: readonly ExportFormat[];
}[];

export function exportFormatLabel(format: ExportFormat): string {
  if (format === "mp4") return "MP4";
  if (format === "webm") return "WebM";
  return format.toUpperCase();
}

export function exportFormatDisabled(
  format: ExportFormat,
  options: { oddSize: boolean; ffmpegReady: boolean },
): boolean {
  if (!options.ffmpegReady && exportNeedsFfmpeg(format)) return true;
  if (options.oddSize && isVideoExportFormat(format)) return true;
  return false;
}

export function exportFormatHelper(format: ExportFormat): string | undefined {
  if (isAudioExportFormat(format)) {
    return "Unmuted audio and music for the composition length.";
  }
  return undefined;
}
