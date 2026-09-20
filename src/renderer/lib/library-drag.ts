export const LIBRARY_ASSET_MIME = "application/x-automedia-asset";

export function friendlyMediaError(error: unknown): string {
  if (!(error instanceof Error)) return "Could not add media.";
  const code = "code" in error ? String(error.code) : "";
  if (code === "ffmpeg_unavailable" || code === "ffprobe_unavailable") {
    return error.message;
  }
  if (code === "probe_failed") return "Could not read this media file.";
  return error.message || "Could not add media.";
}
