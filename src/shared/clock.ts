import type { MediaTrack } from "./schemas.ts";

export function frameCount(durationSeconds: number, fps: number): number {
  return Math.max(1, Math.round(durationSeconds * fps));
}

export function frameFromTime(timeSeconds: number, fps: number, durationSeconds: number): number {
  const lastFrame = frameCount(durationSeconds, fps) - 1;
  return Math.min(lastFrame, Math.max(0, Math.round(timeSeconds * fps)));
}

export function timeFromFrame(frame: number, fps: number): number {
  return frame / fps;
}

export function clampTime(timeSeconds: number, durationSeconds: number): number {
  return Math.min(durationSeconds, Math.max(0, timeSeconds));
}

export function isTrackActive(track: MediaTrack, timeSeconds: number): boolean {
  return timeSeconds >= track.start && timeSeconds < track.start + track.duration;
}

export function mediaTime(track: MediaTrack, timeSeconds: number): number {
  return track.trimStart + (timeSeconds - track.start) * track.rate;
}
