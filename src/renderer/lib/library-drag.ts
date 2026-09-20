export const LIBRARY_ASSET_MIME = "application/x-automedia-asset";

export function friendlyMediaError(cause: unknown): string {
  if (!(cause instanceof Error)) return "Could not add media.";
  const code = "code" in cause ? String(cause.code) : "";
  if (code === "ffmpeg_unavailable" || code === "ffprobe_unavailable") {
    return cause.message;
  }
  if (code === "probe_failed") return "Could not read this media file.";
  return cause.message || "Could not add media.";
}
