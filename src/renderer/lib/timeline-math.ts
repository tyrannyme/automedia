import { contentDuration } from "@shared/duration.ts";
import { neighborBounds } from "@shared/clips.ts";

export type TimelineClip = {
  id: string;
  start: number;
  duration: number;
  trimStart: number;
  lane: number;
};

export {
  groupLanes,
  moveClipOnLane,
  nextFreeStart,
  nextLane,
  preferredLane,
  reorderLanes,
} from "@shared/clips.ts";

export function clipLabel(track: {
  kind: string;
  name?: string | undefined;
  asset: string;
}): string {
  if (track.name && track.name.trim() !== "") return track.name;
  if (track.kind === "block") return "Block";
  if (track.kind === "music") return "Music";
  return track.asset;
}

export const TIMELINE_SNAP = 0.04;
export const TIMELINE_TAIL = 2;
export const LANE_HEIGHT = 32;
export const LANE_VIDEO = LANE_HEIGHT;
export const LANE_AUDIO = LANE_HEIGHT;
export const LANE_GAP = 2;

export function laneHeight(_kind?: string): number {
  return LANE_HEIGHT;
}

export function laneRowHeight(kind: string): number {
  return laneHeight(kind) + LANE_GAP;
}

export function rowOffset(tracks: readonly { kind: string }[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) {
    offset += laneRowHeight(tracks[i]?.kind ?? "video");
  }
  return offset;
}

export function rowIndexAtOffset(tracks: readonly { kind: string }[], y: number): number {
  if (tracks.length === 0) return 0;
  let offset = 0;
  for (let i = 0; i < tracks.length; i += 1) {
    const height = laneRowHeight(tracks[i]?.kind ?? "video");
    if (y < offset + height) return i;
    offset += height;
  }
  return tracks.length - 1;
}

export function dropLineOffset(
  tracks: readonly { kind: string }[],
  fromIndex: number,
  toIndex: number,
): number | null {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= tracks.length) return null;
  if (toIndex < fromIndex) return rowOffset(tracks, toIndex);
  return rowOffset(tracks, toIndex) + laneRowHeight(tracks[toIndex]?.kind ?? "video");
}

export function clampZoom(pixelsPerSecond: number): number {
  return Math.min(800, Math.max(24, pixelsPerSecond));
}

export function secondsFromX(
  clientX: number,
  surfaceLeft: number,
  scrollLeft: number,
  pixelsPerSecond: number,
): number {
  return Math.max(0, (clientX - surfaceLeft + scrollLeft) / pixelsPerSecond);
}

export function activeSnap(
  timeSeconds: number,
  targets: number[],
  threshold: number,
): number | null {
  let nearest: number | null = null;
  let best = threshold;
  for (const target of targets) {
    const delta = Math.abs(target - timeSeconds);
    if (delta < best) {
      best = delta;
      nearest = target;
    }
  }
  return nearest;
}

export function snapTime(timeSeconds: number, targets: number[], threshold: number): number {
  return activeSnap(timeSeconds, targets, threshold) ?? timeSeconds;
}

export function snapTargets(
  clips: TimelineClip[],
  markers: { timeSeconds: number }[],
  playheadSeconds: number,
  durationSeconds: number,
  ignoreId?: string,
): number[] {
  const targets = [0, durationSeconds, playheadSeconds];
  for (const marker of markers) targets.push(marker.timeSeconds);
  for (const clip of clips) {
    if (clip.id === ignoreId) continue;
    targets.push(clip.start, clip.start + clip.duration);
  }
  return targets;
}

export function clipEnd(clip: { start: number; duration: number }): number {
  return clip.start + clip.duration;
}

export function neededDuration(
  clips: readonly { start: number; duration: number }[],
  _currentDuration: number,
  maxDuration: number,
): number {
  return contentDuration(clips, maxDuration);
}

export function timelineExtent(
  clips: readonly { start: number; duration: number }[],
  _durationSeconds: number,
  viewportSeconds: number,
): number {
  return contentDuration(clips) + Math.max(TIMELINE_TAIL, viewportSeconds);
}

export function moveClip(clip: TimelineClip, nextStart: number, maxDuration: number): TimelineClip {
  const latest = Math.max(0, maxDuration - clip.duration);
  const start = Math.max(0, Math.min(latest, nextStart));
  return { ...clip, start };
}

export function trimClipStart(clip: TimelineClip, nextStart: number): TimelineClip {
  const maxStart = clip.start + clip.duration - 1 / 60;
  const start = Math.max(0, Math.min(maxStart, nextStart));
  const delta = start - clip.start;
  return {
    ...clip,
    start,
    duration: clip.duration - delta,
    trimStart: Math.max(0, clip.trimStart + delta),
  };
}

export function trimClipEnd(
  clip: TimelineClip,
  nextEnd: number,
  maxDuration: number,
): TimelineClip {
  const minEnd = clip.start + 1 / 60;
  const end = Math.max(minEnd, Math.min(maxDuration, nextEnd));
  return { ...clip, duration: end - clip.start };
}

export function trimClipStartOnLane(
  clip: TimelineClip,
  nextStart: number,
  clips: readonly TimelineClip[],
): TimelineClip {
  const { prevEnd } = neighborBounds(clip, clips);
  return trimClipStart(clip, Math.max(prevEnd, nextStart));
}

export function trimClipEndOnLane(
  clip: TimelineClip,
  nextEnd: number,
  clips: readonly TimelineClip[],
  maxDuration: number,
): TimelineClip {
  const { nextStart } = neighborBounds(clip, clips);
  const cap = Number.isFinite(nextStart) ? Math.min(maxDuration, nextStart) : maxDuration;
  return trimClipEnd(clip, nextEnd, cap);
}

export function splitClip(
  clip: TimelineClip,
  timeSeconds: number,
  nextId: string,
): [TimelineClip, TimelineClip] | null {
  if (timeSeconds <= clip.start || timeSeconds >= clip.start + clip.duration) return null;
  const leftDuration = timeSeconds - clip.start;
  const right: TimelineClip = {
    ...clip,
    id: nextId,
    start: timeSeconds,
    duration: clip.duration - leftDuration,
    trimStart: clip.trimStart + leftDuration,
  };
  return [{ ...clip, duration: leftDuration }, right];
}

export function rippleDelete(clips: TimelineClip[], removedId: string): TimelineClip[] {
  const removed = clips.find((clip) => clip.id === removedId);
  if (!removed) return clips;
  const end = removed.start + removed.duration;
  return clips
    .filter((clip) => clip.id !== removedId)
    .map((clip) => {
      if (clip.lane !== removed.lane || clip.start < end) return clip;
      return { ...clip, start: clip.start - removed.duration };
    });
}

export function rulerTicks(
  durationSeconds: number,
  pixelsPerSecond: number,
  width: number,
  scrollLeft: number,
): { time: number; x: number }[] {
  const step = niceStep(80 / pixelsPerSecond);
  const start = Math.floor(scrollLeft / pixelsPerSecond / step) * step;
  const end = Math.min(durationSeconds, (scrollLeft + width) / pixelsPerSecond + step);
  const ticks: { time: number; x: number }[] = [];
  for (let time = Math.max(0, start); time <= end + 1e-9; time += step) {
    ticks.push({ time, x: time * pixelsPerSecond });
  }
  return ticks;
}

function niceStep(raw: number): number {
  const steps = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const step of steps) {
    if (step >= raw) return step;
  }
  return 60;
}
