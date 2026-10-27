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
/** Time 0 sits this far in from the lanes' left edge, so the first clip has room. */
export const TIMELINE_INSET = 8;
export const LANE_ROW = 44;
export const LANE_ROW_COMPACT = 36;
export const ZOOM_MIN = 24;
export const ZOOM_MAX = 800;

/** Every lane is one height; compact windows use a shorter row. */
export function laneRowHeight(_kind?: string, row = LANE_ROW): number {
  return row;
}

/** A clip sits inside its row with a little air above and below. */
export function clipInset(row = LANE_ROW): number {
  return row >= LANE_ROW ? 4 : 3;
}

export function rowOffset(
  tracks: readonly { kind: string }[],
  index: number,
  row = LANE_ROW,
): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) {
    offset += laneRowHeight(tracks[i]?.kind ?? "video", row);
  }
  return offset;
}

export function rowIndexAtOffset(
  tracks: readonly { kind: string }[],
  y: number,
  row = LANE_ROW,
): number {
  if (tracks.length === 0) return 0;
  let offset = 0;
  for (let i = 0; i < tracks.length; i += 1) {
    const height = laneRowHeight(tracks[i]?.kind ?? "video", row);
    if (y < offset + height) return i;
    offset += height;
  }
  return tracks.length - 1;
}

export function dropLineOffset(
  tracks: readonly { kind: string }[],
  fromIndex: number,
  toIndex: number,
  row = LANE_ROW,
): number | null {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= tracks.length) return null;
  if (toIndex < fromIndex) return rowOffset(tracks, toIndex, row);
  return rowOffset(tracks, toIndex, row) + laneRowHeight(tracks[toIndex]?.kind ?? "video", row);
}

/**
 * Where a media drop opens a new lane: near a boundary between rows, or below
 * the last row. Returns the row index the new lane takes, or null to drop onto
 * the row under the pointer.
 */
export function newLaneIndexAt(rows: number, y: number, row = LANE_ROW, edge = 8): number | null {
  if (rows === 0 || y >= rows * row - edge) return rows;
  const nearest = Math.round(y / row);
  if (nearest > 0 && nearest < rows && Math.abs(y - nearest * row) <= edge) return nearest;
  return null;
}

export function clampZoom(pixelsPerSecond: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pixelsPerSecond));
}

/** The zoom slider is logarithmic, so each step feels the same at any zoom. */
export function zoomToSlider(pixelsPerSecond: number): number {
  const span = Math.log(ZOOM_MAX / ZOOM_MIN);
  return Math.log(clampZoom(pixelsPerSecond) / ZOOM_MIN) / span;
}

export function sliderToZoom(position: number): number {
  const span = Math.log(ZOOM_MAX / ZOOM_MIN);
  return clampZoom(ZOOM_MIN * Math.exp(Math.min(1, Math.max(0, position)) * span));
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
  return labeledSnapTargets(clips, markers, playheadSeconds, durationSeconds, ignoreId).map(
    (target) => target.time,
  );
}

export type SnapTarget = { time: number; label: string; markerId?: string };

/** The same targets as snapTargets, named for the snap tooltip. */
export function labeledSnapTargets(
  clips: (TimelineClip & { kind?: string; name?: string | undefined; asset?: string })[],
  markers: readonly { timeSeconds: number; id?: string; label?: string }[],
  playheadSeconds: number,
  durationSeconds: number,
  ignoreId?: string,
): SnapTarget[] {
  const targets: SnapTarget[] = [
    { time: 0, label: "start" },
    { time: durationSeconds, label: "end" },
    { time: playheadSeconds, label: "playhead" },
  ];
  for (const marker of markers) {
    const target: SnapTarget = { time: marker.timeSeconds, label: marker.label || "marker" };
    if (marker.id) target.markerId = marker.id;
    targets.push(target);
  }
  for (const clip of clips) {
    if (clip.id === ignoreId) continue;
    const name =
      clip.kind && clip.asset
        ? clipLabel({ kind: clip.kind, name: clip.name, asset: clip.asset })
        : "clip";
    targets.push(
      { time: clip.start, label: name },
      { time: clip.start + clip.duration, label: name },
    );
  }
  return targets;
}

/** The nearest target within the threshold. Earlier targets win ties, as in activeSnap. */
export function nearestSnap(
  timeSeconds: number,
  targets: readonly SnapTarget[],
  threshold: number,
): SnapTarget | null {
  let nearest: SnapTarget | null = null;
  let best = threshold;
  for (const target of targets) {
    const delta = Math.abs(target.time - timeSeconds);
    if (delta < best) {
      best = delta;
      nearest = target;
    }
  }
  return nearest;
}

/** Seconds for the snap tooltip, always two decimals. */
export function formatSnapSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(2)} s`;
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

/** Ruler label for a tick, with as many decimals as the tick step needs. */
export function formatRulerTime(time: number, step: number): string {
  if (time >= 60 && step >= 1) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.round(time - minutes * 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return `${time.toFixed(decimals)}s`;
}

function niceStep(raw: number): number {
  const steps = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const step of steps) {
    if (step >= raw) return step;
  }
  return 60;
}
