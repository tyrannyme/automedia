import { limits } from "./limits.ts";

const EPS = 1e-6;

export type ClipSpan = {
  id: string;
  start: number;
  duration: number;
  lane: number;
};

export type LaneClip = ClipSpan & { kind: string };

export type LaneGroup<T extends LaneClip> = {
  lane: number;
  kind: string;
  clips: T[];
};

export type NeighborBounds = {
  prevEnd: number;
  nextStart: number;
};

export type StartWindow = {
  min: number;
  max: number;
};

export function clipsOverlap(
  a: { start: number; duration: number },
  b: { start: number; duration: number },
): boolean {
  return a.start + EPS < b.start + b.duration && b.start + EPS < a.start + a.duration;
}

export function uniqueLanes(clips: readonly { lane: number }[]): number[] {
  return [...new Set(clips.map((clip) => clip.lane))].toSorted((left, right) => left - right);
}

export function nextLane(clips: readonly { lane: number }[]): number {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map((clip) => clip.lane)) + 1;
}

export function occupantsOnLane<T extends ClipSpan>(
  clips: readonly T[],
  lane: number,
  exceptId?: string,
): T[] {
  return clips
    .filter((clip) => clip.lane === lane && clip.id !== exceptId)
    .toSorted((left, right) => left.start - right.start || left.id.localeCompare(right.id));
}

export function laneAccepts(
  clips: readonly { lane: number; kind: string }[],
  lane: number,
  kind: string,
): boolean {
  const existing = clips.find((clip) => clip.lane === lane);
  return existing === undefined || existing.kind === kind;
}

export function preferredLane(
  clips: readonly { lane: number; kind: string }[],
  kind: string,
  requested?: number,
): number {
  if (requested !== undefined && laneAccepts(clips, requested, kind)) return requested;
  for (const lane of uniqueLanes(clips)) {
    if (laneAccepts(clips, lane, kind)) return lane;
  }
  return nextLane(clips);
}

export function groupLanes<T extends LaneClip>(clips: readonly T[]): LaneGroup<T>[] {
  return uniqueLanes(clips).map((lane) => {
    const items = occupantsOnLane(clips, lane);
    return { lane, kind: items[0]?.kind ?? "block", clips: items };
  });
}

export function compactLanes<T extends { lane: number }>(clips: readonly T[]): T[] {
  const remap = new Map(uniqueLanes(clips).map((lane, index) => [lane, index]));
  return clips.map((clip) => ({ ...clip, lane: remap.get(clip.lane) ?? 0 }));
}

export function reorderLanes<T extends { lane: number }>(
  clips: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const lanes = uniqueLanes(clips);
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= lanes.length ||
    toIndex >= lanes.length
  ) {
    return compactLanes(clips);
  }
  const ordered = [...lanes];
  const [moved] = ordered.splice(fromIndex, 1);
  if (moved === undefined) return compactLanes(clips);
  ordered.splice(toIndex, 0, moved);
  const remap = new Map(ordered.map((lane, index) => [lane, index]));
  return clips.map((clip) => ({ ...clip, lane: remap.get(clip.lane) ?? 0 }));
}

export function nextFreeStart(
  clips: readonly ClipSpan[],
  lane: number,
  start: number,
  duration: number,
  exceptId?: string,
): number {
  let next = Math.max(0, start);
  for (const clip of occupantsOnLane(clips, lane, exceptId)) {
    if (next + duration <= clip.start + EPS) return next;
    if (next + EPS < clip.start + clip.duration) next = clip.start + clip.duration;
  }
  return next;
}

export function neighborBounds(clip: ClipSpan, clips: readonly ClipSpan[]): NeighborBounds {
  const others = occupantsOnLane(clips, clip.lane, clip.id);
  let prevEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const other of others) {
    if (other.start + other.duration <= clip.start + EPS) {
      prevEnd = Math.max(prevEnd, other.start + other.duration);
    } else if (other.start + EPS >= clip.start + clip.duration) {
      nextStart = Math.min(nextStart, other.start);
    } else if (other.start + other.duration / 2 <= clip.start + clip.duration / 2) {
      prevEnd = Math.max(prevEnd, other.start + other.duration);
    } else {
      nextStart = Math.min(nextStart, other.start);
    }
  }
  return { prevEnd, nextStart };
}

export function allowedStarts(
  occupants: readonly { start: number; duration: number }[],
  duration: number,
  maxDuration: number,
): StartWindow[] {
  const sorted = [...occupants].toSorted((left, right) => left.start - right.start);
  let cursor = 0;
  const windows: StartWindow[] = [];
  for (const item of sorted) {
    const gapEnd = item.start - duration;
    if (gapEnd + EPS >= cursor) windows.push({ min: cursor, max: Math.max(cursor, gapEnd) });
    cursor = Math.max(cursor, item.start + item.duration);
  }
  const lastMax = Math.max(0, maxDuration - duration);
  if (lastMax + EPS >= cursor) windows.push({ min: cursor, max: lastMax });
  return windows;
}

export function snapStartToLane(
  proposed: number,
  occupants: readonly { start: number; duration: number }[],
  duration: number,
  maxDuration: number,
): number {
  const start = Math.max(0, Math.min(Math.max(0, maxDuration - duration), proposed));
  const windows = allowedStarts(occupants, duration, maxDuration);
  if (windows.length === 0) return start;
  for (const window of windows) {
    if (start + EPS >= window.min && start <= window.max + EPS) {
      return Math.min(window.max, Math.max(window.min, start));
    }
  }
  const first = windows[0];
  if (!first) return start;
  let best = first.min;
  let bestDist = Math.abs(start - best);
  for (const window of windows) {
    for (const edge of [window.min, window.max]) {
      const dist = Math.abs(start - edge);
      if (dist < bestDist) {
        bestDist = dist;
        best = edge;
      }
    }
  }
  return best;
}

export function moveClipOnLane<T extends ClipSpan>(
  clip: T,
  nextStart: number,
  clips: readonly ClipSpan[],
  maxDuration: number = limits.maxDurationSeconds,
): T {
  const others = occupantsOnLane(clips, clip.lane, clip.id);
  const windows = allowedStarts(others, clip.duration, maxDuration);
  if (windows.length === 0) return clip;
  return { ...clip, start: snapStartToLane(nextStart, others, clip.duration, maxDuration) };
}
