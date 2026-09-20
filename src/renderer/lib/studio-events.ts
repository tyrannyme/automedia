export function isThumbnailStudioEvent(type: string): boolean {
  return type === "thumbnail_ready" || type === "thumbnail_error";
}
