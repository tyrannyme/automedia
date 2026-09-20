import { isDocumentKind } from "./media.ts";

export const CLIP_SWATCHES = [
  "#3B82F6",
  "#22C55E",
  "#EAB308",
  "#A855F7",
  "#F43F5E",
  "#06B6D4",
  "#F97316",
  "#64748B",
] as const;

export type ClipSwatch = (typeof CLIP_SWATCHES)[number];

export function nextClipColor(
  tracks: readonly { kind: string; color?: string | undefined }[],
): string {
  const used = new Set(
    tracks
      .map((track) => track.color?.toUpperCase())
      .filter((color): color is string => Boolean(color)),
  );
  const unused = CLIP_SWATCHES.find((color) => !used.has(color.toUpperCase()));
  if (unused) return unused;
  const blocks = tracks.filter((track) => isDocumentKind(track.kind)).length;
  return CLIP_SWATCHES[blocks % CLIP_SWATCHES.length] ?? CLIP_SWATCHES[0];
}

export function clipInk(color: string): "#0A0A0A" | "#F5F5F5" {
  const hex = color.replace("#", "");
  if (hex.length < 6) return "#F5F5F5";
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) return "#F5F5F5";
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? "#0A0A0A" : "#F5F5F5";
}
