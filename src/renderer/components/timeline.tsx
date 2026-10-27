import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  FilmIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlusIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  Square2StackIcon,
} from "@heroicons/react/24/outline";
import type { Composition, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import { nextFreeStart, type LaneGroup } from "@shared/clips.ts";
import { contentDuration } from "@shared/duration.ts";
import { isBlockKind, isMusicKind } from "@shared/media.ts";
import { limits } from "@shared/limits.ts";
import { ClipGhost, TimelineClip, type ClipDragKind } from "@/components/timeline-clip.tsx";
import { TimelineBar } from "@/components/timeline-bar.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { newLocalId } from "@/lib/ids.ts";
import { LIBRARY_ASSET_MIME } from "@/lib/library-drag.ts";
import {
  clampZoom,
  clipLabel,
  dropLineOffset,
  formatRulerTime,
  formatSnapSeconds,
  groupLanes,
  labeledSnapTargets,
  LANE_ROW,
  LANE_ROW_COMPACT,
  moveClipOnLane,
  nearestSnap,
  newLaneIndexAt,
  nextLane,
  reorderLanes,
  rippleDelete,
  rowIndexAtOffset,
  rowOffset,
  rulerTicks,
  secondsFromX,
  splitClip,
  timelineExtent,
  TIMELINE_INSET,
  TIMELINE_SNAP,
  trimClipEndOnLane,
  trimClipStartOnLane,
  type SnapTarget,
} from "@/lib/timeline-math.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

type TimelineProps = {
  composition: Composition;
  media: MediaDocument;
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  collapsed: boolean;
  onExpand: () => void;
  onSeek: (seconds: number) => void;
  onSelectTrack: (id: string | null) => void;
  onSelectMarker: (id: string) => void;
  onTrack?: (track: MediaTrack, persist?: boolean) => Promise<void>;
  onTracks?: (tracks: MediaTrack[], persist?: boolean) => Promise<void>;
  onDeleteTrack?: (id: string) => Promise<void>;
  onMarker?: (marker: { id: string; timeSeconds: number; label: string }) => Promise<void>;
  onCreateBlock?: (start?: number, lane?: number) => void;
  onCreateMusic?: (start?: number, lane?: number) => void;
  onDropAsset?: (asset: string, start: number, lane?: number) => void;
  onEditBlock?: (id: string) => void;
  onEditMusic?: (id: string) => void;
  /** Kept for callers of the old transport; the player owns these now. */
  onPlayToggle?: () => void;
  onLoopToggle?: () => void;
  onSettings?: () => void;
};

type DragKind = ClipDragKind | "marker" | "lane";

type Drag = {
  kind: DragKind;
  id: string;
  originX: number;
  originY: number;
  originStart: number;
  originDuration: number;
  originTrim: number;
  originTime: number;
  originIndex: number;
};

/** Ruler height, the track-head column and the space under the last lane. */
const GEOMETRY = {
  regular: { ruler: 26, heads: 168, row: LANE_ROW, pad: 10 },
  compact: { ruler: 22, heads: 124, row: LANE_ROW_COMPACT, pad: 6 },
} as const;

/** Alt drags freely; otherwise the nearest target within reach pulls the edge to it. */
function snapTo(raw: number, targets: SnapTarget[], free: boolean): SnapTarget | null {
  return free ? null : nearestSnap(raw, targets, TIMELINE_SNAP);
}

/** What the edge being dragged last snapped to, read by the tooltip. */
type SnapHit = { target: SnapTarget | null };

type Row = { kind: "lane"; lane: LaneGroup<MediaTrack>; index: number } | { kind: "new" };

function KindIcon({ kind }: { kind: string }) {
  const className = "size-4 shrink-0 text-faint";
  if (kind === "audio") return <SpeakerWaveIcon className={className} />;
  if (kind === "music") return <MusicalNoteIcon className={className} />;
  if (kind === "image") return <PhotoIcon className={className} />;
  if (kind === "video") return <FilmIcon className={className} />;
  return <Square2StackIcon className={className} />;
}

export function Timeline({
  composition,
  media,
  selectedTrackId,
  selectedMarkerId,
  collapsed,
  onExpand,
  onSeek,
  onSelectTrack,
  onSelectMarker,
  onTrack,
  onTracks,
  onDeleteTrack,
  onMarker,
  onCreateBlock,
  onCreateMusic,
  onDropAsset,
  onEditBlock,
  onEditMusic,
}: TimelineProps) {
  const playheadSeconds = useStudioStore((state) => state.playheadSeconds);
  const loopSeam = useStudioStore((state) => state.loopSeam);
  const compact = useStudioStore((state) => state.compactLayout);
  const files = useStudioStore((state) => state.files);
  const geometry = compact ? GEOMETRY.compact : GEOMETRY.regular;
  const row = geometry.row;
  const sectionRef = useRef<HTMLElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(120);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [width, setWidth] = useState(640);
  const [snap, setSnap] = useState<SnapTarget | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [newLaneAt, setNewLaneAt] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<Drag | null>(null);
  const drag = useRef<Drag | null>(null);
  const menuTime = useRef(0);
  const pendingClip = useRef<MediaTrack | null>(null);
  const pendingTracks = useRef<MediaTrack[] | null>(null);
  const originRows = useRef<MediaTrack[] | null>(null);
  /** Until someone zooms by hand, the timeline keeps fitting its width. */
  const autoFit = useRef<{ id: string; on: boolean }>({ id: "", on: true });
  const dropping = useRef(false);

  const tracks = [...media.tracks].toSorted(
    (a, b) => a.lane - b.lane || a.start - b.start || a.id.localeCompare(b.id),
  );
  const lanes = groupLanes(tracks);
  const duration = contentDuration(tracks);
  const lanesWidth = Math.max(1, width);
  const extent = timelineExtent(tracks, duration, lanesWidth / Math.max(1, pixelsPerSecond));
  const x = (time: number) => TIMELINE_INSET + time * pixelsPerSecond;
  const position = x(playheadSeconds);
  const surfaceWidth = Math.max(lanesWidth, x(extent));
  const ticks = rulerTicks(extent, pixelsPerSecond, lanesWidth, scrollLeft);
  const tickStep = ticks.length > 1 ? ticks[1]!.time - ticks[0]!.time : 1;
  const assets = files
    .filter((file) => file.startsWith("assets/"))
    .map((file) => file.slice("assets/".length));
  const view = { scrollLeft, width: lanesWidth };

  const fitZoom = (available: number) =>
    clampZoom((available - TIMELINE_INSET - 22) / Math.max(0.1, duration + 0.4));

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      setWidth(surface.clientWidth);
      if (autoFit.current.id !== composition.id) autoFit.current = { id: composition.id, on: true };
      // A scrollbar that appears mid-drag must not rescale what is being dragged.
      if (autoFit.current.on && surface.clientWidth > 0 && !drag.current && !dropping.current) {
        setPixelsPerSecond(fitZoom(surface.clientWidth));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
    // fitZoom reads the duration when the width changes; the effect below follows the duration.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, composition.id]);
  useLayoutEffect(() => {
    if (autoFit.current.on && !drag.current && width > 0) setPixelsPerSecond(fitZoom(width));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // The timeline is as tall as its lanes. The compact panel sheet stops above
  // the player, so the stage nest learns the timeline's real height.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const stage = section?.closest<HTMLElement>(".studio-stage");
    if (!section || !stage) return;
    const publish = () =>
      stage.style.setProperty("--stage-timeline-height", `${section.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(section);
    return () => {
      observer.disconnect();
      stage.style.removeProperty("--stage-timeline-height");
    };
  }, [collapsed]);

  const insertY =
    dropIndex !== null && drag.current?.kind === "lane"
      ? dropLineOffset(lanes, drag.current.originIndex, dropIndex, row)
      : null;
  const seenTrackIds = useRef(new Set(media.tracks.map((track) => track.id)));
  const seenCompositionId = useRef(composition.id);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (seenCompositionId.current !== composition.id) {
      seenCompositionId.current = composition.id;
      seenTrackIds.current = new Set(tracks.map((track) => track.id));
      return;
    }
    const added = tracks.find((track) => !seenTrackIds.current.has(track.id));
    seenTrackIds.current = new Set(tracks.map((track) => track.id));
    if (!surface || !added) return;
    const laneIndex = lanes.findIndex((lane) => lane.clips.some((clip) => clip.id === added.id));
    const left = x(added.start);
    const right = left + Math.max(24, added.duration * pixelsPerSecond);
    if (left < surface.scrollLeft) surface.scrollLeft = Math.max(0, left - 16);
    else if (right > surface.scrollLeft + surface.clientWidth) {
      surface.scrollLeft = Math.max(0, right - surface.clientWidth + 16);
    }
    const top = rowOffset(lanes, laneIndex, row);
    const bottom = top + row;
    if (top < surface.scrollTop) surface.scrollTop = top;
    else if (bottom > surface.scrollTop + surface.clientHeight) {
      surface.scrollTop = Math.max(0, bottom - surface.clientHeight);
    }
  });

  const rawTimeAt = (clientX: number) => {
    const rect = (rulerRef.current ?? surfaceRef.current)?.getBoundingClientRect();
    if (!rect) return 0;
    return secondsFromX(
      clientX,
      rect.left + TIMELINE_INSET,
      surfaceRef.current?.scrollLeft ?? 0,
      pixelsPerSecond,
    );
  };

  const timeAt = (clientX: number) => Math.min(duration, rawTimeAt(clientX));

  const targetsFor = (ignoreId?: string, markers = media.markers) =>
    labeledSnapTargets(tracks, markers, playheadSeconds, duration, ignoreId);

  const selectTrack = (id: string | null) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".studio-inspector-rail")) {
      active.blur();
    }
    onSelectTrack(id);
  };

  const followDrag = (clientX: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const zone = 40;
    if (clientX > rect.right - zone) {
      surface.scrollLeft += Math.min(32, (clientX - (rect.right - zone)) * 0.5);
    } else if (clientX < rect.left + zone) {
      surface.scrollLeft = Math.max(
        0,
        surface.scrollLeft - Math.min(32, (rect.left + zone - clientX) * 0.5),
      );
    }
  };

  const zoomTo = (next: number) => {
    autoFit.current.on = false;
    setPixelsPerSecond(clampZoom(next));
  };
  const fit = () => {
    autoFit.current.on = true;
    setPixelsPerSecond(fitZoom(width));
  };

  const applyClip = (track: MediaTrack, persist: boolean) => {
    pendingClip.current = persist ? null : track;
    void onTrack?.(track, persist);
  };

  const placeMarker = (timeSeconds: number) => {
    void onMarker?.({
      id: newLocalId("m"),
      timeSeconds: Math.min(duration, Math.max(0, timeSeconds)),
      label: "Marker",
    });
  };

  /**
   * Moves clips between lanes. The engine rejects a lane that would mix kinds
   * even for a moment, so moved clips park on spare lanes before landing.
   */
  const relane = async (next: MediaTrack[]) => {
    if (!onTracks) return;
    const before = new Map(media.tracks.map((track) => [track.id, track.lane]));
    const moved = next.filter((track) => before.get(track.id) !== track.lane);
    if (moved.length === 0) return;
    const spare =
      Math.max(0, ...media.tracks.map((track) => track.lane), ...next.map((track) => track.lane)) +
      1;
    await onTracks(next, false);
    try {
      for (const track of moved) {
        await window.studio.media.putTrack(composition.id, { ...track, lane: spare + track.lane });
      }
    } finally {
      await onTracks(next, true);
    }
  };

  const applyRows = (next: MediaTrack[], persist: boolean) => {
    pendingTracks.current = persist ? null : next;
    void onTracks?.(next, persist);
  };

  const onRulerPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-marker]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(
      snapTo(timeAt(event.clientX), targetsFor(), event.altKey)?.time ?? timeAt(event.clientX),
    );
  };

  const onLanesPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-clip],[data-edge]")) return;
    selectTrack(null);
  };

  const startDrag = (next: Drag) => {
    drag.current = next;
    setActiveDrag(next);
  };

  const beginClipDrag = (event: React.PointerEvent, track: MediaTrack, kind: ClipDragKind) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    // preventDefault keeps focus where it was, so move it to the grabbed clip.
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.focus({ preventScroll: true });
    selectTrack(track.id);
    startDrag({
      kind,
      id: track.id,
      originX: event.clientX,
      originY: event.clientY,
      originStart: track.start,
      originDuration: track.duration,
      originTrim: track.trimStart,
      originTime: 0,
      originIndex: lanes.findIndex((lane) => lane.clips.some((item) => item.id === track.id)),
    });
    originRows.current = tracks;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginLaneDrag = (event: React.PointerEvent, laneIndex: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const lane = lanes[laneIndex];
    const selected = lane?.clips.find((clip) => clip.id === selectedTrackId) ?? lane?.clips[0];
    if (selected) selectTrack(selected.id);
    startDrag({
      kind: "lane",
      id: selected?.id ?? `lane-${laneIndex}`,
      originX: event.clientX,
      originY: event.clientY,
      originStart: selected?.start ?? 0,
      originDuration: selected?.duration ?? 0,
      originTrim: selected?.trimStart ?? 0,
      originTime: 0,
      originIndex: laneIndex,
    });
    originRows.current = tracks;
    setDropIndex(laneIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const showTip = (time: number, laneIndex: number, text: string) => {
    const left = Math.min(Math.max(0, x(time) - scrollLeft + 10), Math.max(0, lanesWidth - 240));
    setTip({ x: left, y: geometry.ruler + rowOffset(lanes, laneIndex, row) - scrollTop + 8, text });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = drag.current;
    if (!active) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) onSeek(timeAt(event.clientX));
      return;
    }
    const delta = (event.clientX - active.originX) / pixelsPerSecond;
    if (active.kind === "marker") {
      const marker = media.markers.find((item) => item.id === active.id);
      if (!marker || !onMarker) return;
      const raw = Math.max(0, Math.min(duration, active.originTime + delta));
      const target = snapTo(
        raw,
        targetsFor(
          undefined,
          media.markers.filter((item) => item.id !== marker.id),
        ),
        event.altKey,
      );
      setSnap(target);
      void onMarker({ ...marker, timeSeconds: target?.time ?? raw });
      return;
    }
    if (active.kind === "lane") {
      setSnap(null);
      const source = originRows.current ?? tracks;
      const sourceLanes = groupLanes(source);
      setDropIndex(
        rowIndexAtOffset(
          sourceLanes,
          rowOffset(sourceLanes, active.originIndex, row) + (event.clientY - active.originY),
          row,
        ),
      );
      return;
    }
    const track = media.tracks.find((item) => item.id === active.id);
    if (!track) return;
    const origin = {
      ...track,
      start: active.originStart,
      duration: active.originDuration,
      trimStart: active.originTrim,
    };
    const targets = targetsFor(track.id);
    const hit: SnapHit = { target: null };
    const pullTo = (raw: number) => {
      hit.target = snapTo(raw, targets, event.altKey);
      setSnap(hit.target);
      return hit.target?.time ?? raw;
    };
    const suffix = (text: string) =>
      hit.target ? ` · ${text ? `${text} ` : ""}${hit.target.label}` : "";
    followDrag(event.clientX);
    const laneIndex = Math.max(0, active.originIndex);
    if (active.kind === "move") {
      const next = {
        ...track,
        ...moveClipOnLane(
          origin,
          pullTo(active.originStart + delta),
          tracks,
          limits.maxDurationSeconds,
        ),
      };
      applyClip(next, false);
      showTip(
        next.start + next.duration,
        laneIndex,
        `${next.start.toFixed(2)} → ${formatSnapSeconds(next.start + next.duration)}${suffix("")}`,
      );
      return;
    }
    if (active.kind === "trim-start") {
      const next = {
        ...track,
        ...trimClipStartOnLane(origin, pullTo(active.originStart + delta), tracks),
      };
      applyClip(next, false);
      showTip(
        next.start + next.duration,
        laneIndex,
        `in ${formatSnapSeconds(next.start)}${suffix("snapped to")}`,
      );
      return;
    }
    const end = pullTo(active.originStart + active.originDuration + delta);
    const next = {
      ...track,
      ...trimClipEndOnLane(origin, end, tracks, limits.maxDurationSeconds),
    };
    applyClip(next, false);
    showTip(
      Math.max(next.start + next.duration, active.originStart + active.originDuration),
      laneIndex,
      `${formatSnapSeconds(next.duration)}${suffix("snapped to")}`,
    );
  };

  const endDrag = () => {
    drag.current = null;
    setActiveDrag(null);
    setSnap(null);
    setTip(null);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    const active = drag.current;
    endDrag();
    if (active?.kind === "lane") {
      const source = originRows.current ?? tracks;
      const nextIndex = dropIndex ?? active.originIndex;
      setDropIndex(null);
      if (nextIndex !== active.originIndex) {
        void relane(reorderLanes(source, active.originIndex, nextIndex));
      }
      pendingTracks.current = null;
      pendingClip.current = null;
      return;
    }
    setDropIndex(null);
    const rows = pendingTracks.current;
    pendingTracks.current = null;
    if (rows) {
      applyRows(rows, true);
      pendingClip.current = null;
      return;
    }
    const clip = pendingClip.current;
    pendingClip.current = null;
    if (clip) applyClip(clip, true);
  };

  const splitTrack = (track: MediaTrack) => {
    if (!onTrack) return;
    const parts = splitClip(track, playheadSeconds, newLocalId("t"));
    if (!parts) return;
    void onTrack({ ...track, ...parts[0] }).then(() => onTrack({ ...track, ...parts[1] }));
  };

  const splitSelected = () => {
    const track = media.tracks.find((item) => item.id === selectedTrackId);
    if (track) splitTrack(track);
  };

  const deleteSelected = (ripple: boolean) => {
    if (!selectedTrackId || !onDeleteTrack) return;
    if (ripple && onTrack) {
      const next = rippleDelete(tracks, selectedTrackId);
      void onDeleteTrack(selectedTrackId).then(async () => {
        for (const clip of next) {
          const original = media.tracks.find((item) => item.id === clip.id);
          if (original && original.start !== clip.start) {
            await onTrack({ ...original, start: clip.start });
          }
        }
      });
      return;
    }
    void onDeleteTrack(selectedTrackId);
  };

  /** A copy of a media clip right after it. Blocks and music share code, so they are not copied. */
  const duplicateTrack = (track: MediaTrack) => {
    void onTrack?.({
      ...track,
      id: newLocalId("t"),
      start: nextFreeStart(tracks, track.lane, track.start + track.duration, track.duration),
    });
  };

  const importMedia = () => {
    void window.studio.assets
      .import(composition.id)
      .then((result) => {
        if (result) onDropAsset?.(result.asset, playheadSeconds);
      })
      .catch(() => {});
  };

  const ghost = (() => {
    const active = activeDrag;
    if (!active || (active.kind !== "trim-start" && active.kind !== "trim-end")) return null;
    const track = media.tracks.find((item) => item.id === active.id);
    if (!track) return null;
    if (active.kind === "trim-end") {
      const end = track.start + track.duration;
      const originEnd = active.originStart + active.originDuration;
      if (originEnd - end <= 1e-3) return null;
      return {
        ...track,
        start: end,
        duration: originEnd - end,
        trimStart: track.trimStart + track.duration * track.rate,
      };
    }
    if (track.start - active.originStart <= 1e-3) return null;
    return {
      ...track,
      start: active.originStart,
      duration: track.start - active.originStart,
      trimStart: active.originTrim,
    };
  })();

  const laneAtDrop = (clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const y = clientY - surface.getBoundingClientRect().top + surface.scrollTop;
    const shown = newLaneAt;
    // Read the pointer against the rows as they were before the New lane row opened.
    const original =
      shown === null || y < shown * row ? y : y < (shown + 1) * row ? shown * row : y - row;
    return newLaneIndexAt(lanes.length, original, row);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onDropAsset || !event.dataTransfer.types.includes(LIBRARY_ASSET_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropping.current = true;
    const raw = rawTimeAt(event.clientX);
    const target = snapTo(raw, targetsFor(), event.altKey);
    const time = target?.time ?? raw;
    const lane = laneAtDrop(event.clientY);
    setNewLaneAt(lane);
    setSnap(target ?? { time, label: "" });
    const rowIndex = lane ?? Math.min(lanes.length - 1, Math.max(0, rowAtClientY(event.clientY)));
    showTip(time, rowIndex, `${formatSnapSeconds(time)}${target ? ` · ${target.label}` : ""}`);
  };

  const rowAtClientY = (clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return 0;
    const y = clientY - surface.getBoundingClientRect().top + surface.scrollTop;
    return rowIndexAtOffset(lanes, y, row);
  };

  const clearDrop = () => {
    dropping.current = false;
    setSnap(null);
    setTip(null);
    setNewLaneAt(null);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onDropAsset) return;
    const asset = event.dataTransfer.getData(LIBRARY_ASSET_MIME);
    const raw = rawTimeAt(event.clientX);
    const time = snapTo(raw, targetsFor(), event.altKey)?.time ?? raw;
    const opened = newLaneAt;
    clearDrop();
    if (!asset) return;
    event.preventDefault();
    if (opened !== null) {
      const taken = lanes[opened]?.lane;
      if (taken === undefined) {
        onDropAsset(asset, time, nextLane(tracks));
        return;
      }
      const shifted = tracks.map((track) =>
        track.lane >= taken ? { ...track, lane: track.lane + 1 } : track,
      );
      void relane(shifted).then(() => onDropAsset(asset, time, taken));
      return;
    }
    const laneValue =
      event.target instanceof Element
        ? event.target.closest("[data-lane]")?.getAttribute("data-lane")
        : null;
    const lane = laneValue === null || laneValue === undefined ? undefined : Number(laneValue);
    onDropAsset(asset, time, Number.isFinite(lane) ? lane : undefined);
  };

  const bar = (
    <TimelineBar
      compact={compact}
      collapsed={collapsed}
      playheadSeconds={playheadSeconds}
      hasSelection={Boolean(selectedTrackId)}
      pixelsPerSecond={pixelsPerSecond}
      assets={assets}
      onAddBlock={() => onCreateBlock?.(playheadSeconds)}
      onAddMusic={() => onCreateMusic?.(playheadSeconds)}
      onAddMarker={() => placeMarker(playheadSeconds)}
      onAddMedia={(asset) => onDropAsset?.(asset, playheadSeconds)}
      onImportMedia={importMedia}
      onSplit={splitSelected}
      onDelete={() => deleteSelected(false)}
      onZoom={zoomTo}
      onFit={fit}
      onExpand={onExpand}
    />
  );

  if (collapsed) {
    return (
      <section
        ref={sectionRef}
        className="flex shrink-0 flex-col border-t border-border bg-canvas-timeline"
        aria-label="Timeline"
        data-canvas="timeline"
      >
        {bar}
      </section>
    );
  }

  const rows: Row[] = lanes.map((lane, index) => ({ kind: "lane", lane, index }));
  if (newLaneAt !== null) rows.splice(newLaneAt, 0, { kind: "new" });
  const lanesHeight = rows.length * row;
  const outLeft = x(duration);
  const itemClass = "gap-2.5 px-2.5 py-2 [&_svg]:text-muted-foreground";
  const laneMenu = (lane?: number) => (
    <ContextMenuContent className="w-60">
      <ContextMenuItem
        className={itemClass}
        onClick={() => onCreateBlock?.(menuTime.current, lane)}
      >
        <Square2StackIcon />
        Block
        <span className="ml-auto font-mono text-[12px] text-dim">here</span>
      </ContextMenuItem>
      <ContextMenuItem
        className={itemClass}
        onClick={() => onCreateMusic?.(menuTime.current, lane)}
      >
        <MusicalNoteIcon />
        Music
        <span className="ml-auto font-mono text-[12px] text-dim">here</span>
      </ContextMenuItem>
      <ContextMenuItem className={itemClass} onClick={() => placeMarker(menuTime.current)}>
        <MapPinIcon />
        Marker
        <span className="ml-auto font-mono text-[12px] text-dim">here</span>
      </ContextMenuItem>
      {lanes.length > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={itemClass}
            onClick={() => onCreateBlock?.(menuTime.current, nextLane(tracks))}
          >
            <PlusIcon />
            Block on a new lane
          </ContextMenuItem>
          <ContextMenuItem
            className={itemClass}
            onClick={() => onCreateMusic?.(menuTime.current, nextLane(tracks))}
          >
            <PlusIcon />
            Music on a new lane
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );

  return (
    <section
      ref={sectionRef}
      className="flex min-h-0 flex-auto flex-col border-t border-border bg-canvas-timeline"
      aria-label="Timeline"
      data-canvas="timeline"
    >
      {bar}
      <div className="flex min-h-0 flex-auto" style={{ paddingBottom: geometry.pad }}>
        <div className="flex shrink-0 flex-col" style={{ width: geometry.heads }}>
          <div
            className="flex shrink-0 items-center gap-1.5 px-3 font-mono text-[12px] leading-none whitespace-nowrap text-dim"
            style={{ height: geometry.ruler }}
          >
            <span title="Composition length">{duration.toFixed(1)} s</span>
            {loopSeam !== null && !compact && (
              <>
                <span className="text-faint">·</span>
                <span
                  className={loopSeam ? "text-foreground" : undefined}
                  title={loopSeam ? "First and last frames match" : "First and last frames differ"}
                >
                  {loopSeam ? "Loop" : "Open"}
                </span>
              </>
            )}
          </div>
          <div className="min-h-0 flex-auto overflow-hidden">
            <div className="relative" style={{ transform: `translateY(${-scrollTop}px)` }}>
              {lanes.length === 0 && newLaneAt === null && (
                <p
                  className="flex items-center truncate px-3.5 text-[13px] text-dim"
                  style={{ height: row }}
                >
                  No clips yet
                </p>
              )}
              {rows.map((item) => {
                if (item.kind === "new") {
                  return (
                    <div
                      key="new-lane"
                      className="flex items-center gap-2 bg-raised pr-2.5 pl-3.5 text-[13px] font-medium text-foreground"
                      style={{ height: row }}
                    >
                      <PlusIcon className="size-4 shrink-0" />
                      New lane
                    </div>
                  );
                }
                const { lane, index } = item;
                const selectedOnLane = lane.clips.some((clip) => clip.id === selectedTrackId);
                const audible = lane.kind === "audio" || lane.kind === "music";
                const muted = audible && lane.clips.every((clip) => clip.mute);
                const first = lane.clips[0];
                return (
                  <button
                    type="button"
                    key={lane.lane}
                    data-lane={lane.lane}
                    className={cn(
                      "flex w-full cursor-ns-resize items-center gap-2 pr-2.5 pl-3.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-raised hover:transition-none",
                      compact && "gap-1.5 pr-2 pl-3",
                      selectedOnLane && "bg-raised",
                      dropIndex !== null && drag.current?.originIndex === index && "opacity-40",
                    )}
                    style={{ height: row }}
                    onPointerDown={(event) => beginLaneDrag(event, index)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onClick={() => {
                      const clip =
                        lane.clips.find((entry) => entry.id === selectedTrackId) ?? lane.clips[0];
                      if (clip) selectTrack(clip.id);
                    }}
                    aria-pressed={selectedOnLane}
                    aria-label={`Lane ${index + 1}${first ? `, ${clipLabel(first)}` : ""}`}
                  >
                    <KindIcon kind={lane.kind} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {first ? clipLabel(first) : `Lane ${index + 1}`}
                    </span>
                    {audible &&
                      !compact &&
                      (muted ? (
                        <SpeakerXMarkIcon className="size-4 shrink-0" aria-label="Muted" />
                      ) : (
                        <SpeakerWaveIcon
                          className="size-4 shrink-0 text-faint"
                          aria-hidden="true"
                        />
                      ))}
                  </button>
                );
              })}
              {insertY !== null && (
                <span
                  className="pointer-events-none absolute right-0 left-0 z-30 h-0.5 bg-foreground"
                  style={{ top: insertY }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={rulerRef}
            className="relative shrink-0 cursor-ew-resize overflow-hidden"
            style={{ height: geometry.ruler }}
            onPointerDown={onRulerPointer}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="absolute inset-y-0" style={{ left: -scrollLeft, width: surfaceWidth }}>
              <span
                className="pointer-events-none absolute inset-y-0 right-0 bg-white/45 dark:bg-black/35"
                style={{ left: outLeft }}
                aria-hidden="true"
              />
              {ticks.map((tick) => (
                <Fragment key={tick.time}>
                  <span
                    className="pointer-events-none absolute bottom-0 h-2 w-px bg-faint opacity-90"
                    style={{ left: x(tick.time) }}
                    aria-hidden="true"
                  />
                  {[1, 2, 3].map((minor) => (
                    <span
                      key={minor}
                      className="pointer-events-none absolute bottom-0 h-1 w-px bg-faint opacity-50"
                      style={{ left: x(tick.time + (minor * tickStep) / 4) }}
                      aria-hidden="true"
                    />
                  ))}
                  <span
                    className={cn(
                      "pointer-events-none absolute pl-[5px] font-mono text-[12px] leading-none text-dim",
                      compact ? "top-[3px]" : "top-[5px]",
                    )}
                    style={{ left: x(tick.time) }}
                  >
                    {formatRulerTime(tick.time, tickStep)}
                  </span>
                </Fragment>
              ))}
              {media.markers.map((marker) => {
                const on = selectedMarkerId === marker.id || snap?.markerId === marker.id;
                return (
                  <button
                    type="button"
                    data-marker=""
                    key={marker.id}
                    className={cn(
                      "absolute z-10 flex h-5 -translate-x-[5px] items-center gap-1 rounded-[6px] pr-[7px] pl-[5px] text-[12px] leading-none font-medium whitespace-nowrap",
                      compact ? "top-px" : "top-[3px]",
                      on ? "bg-foreground text-background" : "bg-surface text-foreground",
                    )}
                    style={{ left: x(marker.timeSeconds) }}
                    title={marker.label}
                    aria-label={`Marker ${marker.label}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectMarker(marker.id);
                      startDrag({
                        kind: "marker",
                        id: marker.id,
                        originX: event.clientX,
                        originY: event.clientY,
                        originStart: 0,
                        originDuration: 0,
                        originTrim: 0,
                        originTime: marker.timeSeconds,
                        originIndex: 0,
                      });
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                  >
                    <span
                      className={cn(
                        "h-3 w-0.5 rounded-[1px]",
                        on ? "bg-background" : "bg-foreground",
                      )}
                      aria-hidden="true"
                    />
                    {marker.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            ref={surfaceRef}
            data-timeline-surface=""
            className="relative min-h-0 min-w-0 flex-auto overflow-auto"
            onPointerDown={onLanesPointer}
            onDragOver={onDragOver}
            onDragLeave={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }
              clearDrop();
            }}
            onDrop={onDrop}
            onScroll={(event) => {
              setScrollLeft(event.currentTarget.scrollLeft);
              setScrollTop(event.currentTarget.scrollTop);
              setWidth(event.currentTarget.clientWidth);
            }}
            onWheel={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const cursor = secondsFromX(
                event.clientX,
                rect.left + TIMELINE_INSET,
                event.currentTarget.scrollLeft,
                pixelsPerSecond,
              );
              const next = clampZoom(pixelsPerSecond * (event.deltaY < 0 ? 1.1 : 0.9));
              autoFit.current.on = false;
              setPixelsPerSecond(next);
              event.currentTarget.scrollLeft = Math.max(
                0,
                TIMELINE_INSET + cursor * next - (event.clientX - rect.left),
              );
            }}
          >
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <div
                    className="relative min-w-full"
                    style={{ width: surfaceWidth, height: Math.max(lanesHeight, row) }}
                    onPointerDown={onLanesPointer}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onContextMenu={(event) => {
                      menuTime.current = rawTimeAt(event.clientX);
                    }}
                  />
                }
              >
                {insertY !== null && (
                  <span
                    className="pointer-events-none absolute right-0 left-0 z-30 h-0.5 bg-foreground"
                    style={{ top: insertY }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-white/45 dark:bg-black/35"
                  style={{ left: outLeft }}
                  aria-hidden="true"
                />
                {rows.map((item, rowIndex) => {
                  if (item.kind === "new") {
                    return (
                      <div
                        key="new-lane"
                        className="relative w-full bg-black/[0.04] dark:bg-white/[0.045]"
                        style={{ height: row }}
                      />
                    );
                  }
                  const { lane, index } = item;
                  return (
                    <ContextMenu key={lane.lane}>
                      <ContextMenuTrigger
                        render={
                          <div
                            data-lane={lane.lane}
                            className={cn(
                              "relative w-full",
                              rowIndex % 2 === 1 && "bg-black/[0.025] dark:bg-white/[0.018]",
                              dropIndex !== null &&
                                drag.current?.kind === "lane" &&
                                drag.current.originIndex === index &&
                                "opacity-40",
                            )}
                            style={{ height: row }}
                            onContextMenu={(event) => {
                              menuTime.current = rawTimeAt(event.clientX);
                              event.stopPropagation();
                            }}
                          />
                        }
                      >
                        {ghost && ghost.lane === lane.lane && (
                          <ClipGhost
                            track={ghost}
                            compositionId={composition.id}
                            pixelsPerSecond={pixelsPerSecond}
                            row={row}
                            view={view}
                          />
                        )}
                        {lane.clips.map((track) => (
                          <TimelineClip
                            key={track.id}
                            track={track}
                            compositionId={composition.id}
                            selected={selectedTrackId === track.id}
                            pixelsPerSecond={pixelsPerSecond}
                            playheadSeconds={playheadSeconds}
                            row={row}
                            view={view}
                            activeEdge={
                              activeDrag?.id === track.id
                                ? activeDrag.kind === "trim-start"
                                  ? "start"
                                  : activeDrag.kind === "trim-end"
                                    ? "end"
                                    : null
                                : null
                            }
                            onSelect={selectTrack}
                            onBeginDrag={beginClipDrag}
                            onEdit={isMusicKind(track.kind) ? onEditMusic : onEditBlock}
                            onSplit={splitTrack}
                            onDuplicate={
                              isBlockKind(track.kind) || isMusicKind(track.kind)
                                ? undefined
                                : duplicateTrack
                            }
                            onColor={(clip, color) => void onTrack?.({ ...clip, color })}
                            onDelete={(id) => void onDeleteTrack?.(id)}
                          />
                        ))}
                      </ContextMenuTrigger>
                      {laneMenu(lane.lane)}
                    </ContextMenu>
                  );
                })}
              </ContextMenuTrigger>
              {laneMenu()}
            </ContextMenu>
          </div>
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {snap !== null && (
              <span
                className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground"
                style={{ left: x(snap.time) - scrollLeft }}
                aria-hidden="true"
              />
            )}
            <span
              className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-playhead"
              style={{ left: position - scrollLeft }}
              aria-hidden="true"
            />
            <button
              type="button"
              aria-label="Playhead"
              className="pointer-events-auto absolute top-0 flex w-4 -translate-x-1/2 justify-center"
              style={{ left: position - scrollLeft, height: geometry.ruler }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                onSeek(timeAt(event.clientX));
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <span className="h-4 w-3 rounded-[3px_3px_6px_6px] bg-playhead" aria-hidden="true" />
            </button>
            {tip && (
              <span
                className="absolute z-30 rounded-lg bg-foreground px-2.5 py-1.5 font-mono text-[12px] leading-none whitespace-nowrap text-background shadow-float"
                style={{ left: tip.x, top: tip.y }}
                role="status"
              >
                {tip.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
