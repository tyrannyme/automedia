import { limits } from "./limits.ts";

export function contentDuration(
  clips: readonly { start: number; duration: number }[],
  maxDuration: number = limits.maxDurationSeconds,
): number {
  if (clips.length === 0) return Math.min(maxDuration, limits.emptyDurationSeconds);
  let end = 0;
  for (const clip of clips) end = Math.max(end, clip.start + clip.duration);
  return Math.min(maxDuration, end);
}
