import type { Composition, ExportFormat } from "@shared/schemas.ts";
import { isAudioExportFormat, isVideoExportFormat } from "@shared/media.ts";

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

/** Why MP4 and WebM cannot export this composition, or null when they can. */
export function videoExportBlock(
  composition: Pick<Composition, "width" | "height" | "background"> | null,
): string | null {
  if (!composition) return null;
  if (composition.background === "transparent") {
    return "MP4 and WebM need an opaque background. Use a still, an audio format, or set a background color.";
  }
  if (composition.width % 2 !== 0 || composition.height % 2 !== 0) {
    return "MP4 and WebM need even width and height. Use a still, an audio format, or change the composition size.";
  }
  return null;
}

export function exportFormatDisabled(
  format: ExportFormat,
  options: { videoBlocked: boolean },
): boolean {
  return options.videoBlocked && isVideoExportFormat(format);
}

export function exportFormatHelper(format: ExportFormat): string | undefined {
  if (isAudioExportFormat(format)) {
    return "Unmuted audio and music for the composition length.";
  }
  return undefined;
}
