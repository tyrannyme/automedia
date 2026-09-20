import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  BackwardIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  ForwardIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  ScissorsIcon,
  SquaresPlusIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { timeFromFrame, frameFromTime, frameCount } from "@shared/clock.ts";
import type { Composition, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { formatFrameIndex, formatLengthSeconds, formatTimecode } from "@/lib/timecode.ts";
import { newLocalId } from "@/lib/ids.ts";
import {
  activeSnap,
  clampZoom,
  clipLabel,
  dropLineOffset,
  groupLanes,
  laneHeight,
  laneRowHeight,
  moveClipOnLane,
  nextLane,
  reorderLanes,
  rippleDelete,
  rowIndexAtOffset,
  rowOffset,
  rulerTicks,
  secondsFromX,
  snapTime,
  snapTargets,
  splitClip,
  timelineExtent,
  TIMELINE_SNAP,
  trimClipEndOnLane,
  trimClipStartOnLane,
} from "@/lib/timeline-math.ts";
import {
  partitionTransportTools,
  TRANSPORT_GAP,
  TRANSPORT_ICON,
  TRANSPORT_OVERFLOW,
  TRANSPORT_SHOW,
} from "@/lib/transport-overflow.ts";
import { cn } from "@/lib/utils.ts";
import { clipInk } from "@shared/clip-color.ts";
import { contentDuration } from "@shared/duration.ts";
import { isAudibleKind, isImageKind } from "@shared/media.ts";
import { limits } from "@shared/limits.ts";
import { LIBRARY_ASSET_MIME } from "@/lib/library-drag.ts";
import { useStudioStore } from "@/stores/studio.ts";

type TimelineProps = {
  composition: Composition;
  media: MediaDocument;
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  collapsed: boolean;
  onExpand: () => void;
  onSeek: (seconds: number) => void;
  onPlayToggle: () => void;
  onLoopToggle: () => void;
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
  onSettings?: () => void;
};

function JumpStartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 5v14M19 6.5v11L8 12l11-5.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function JumpEndIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 5v14M5 6.5v11L16 12 5 6.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoopIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2" : "1.5"}
    >
      <path
        d="M7 7h8a4 4 0 0 1 4 4v1M17 17H9a4 4 0 0 1-4-4v-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m15 4 3 3-3 3M9 20l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={400} render={children} />
      <TooltipContent
        side="top"
        className="data-closed:animate-none data-open:animate-none data-[state=delayed-open]:animate-none"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

type DragKind = "move" | "trim-start" | "trim-end" | "marker" | "lane";

function clipSurfaceStyle(
  track: MediaTrack,
  selected: boolean,
  pixelsPerSecond: number,
): React.CSSProperties {
  const style: React.CSSProperties = {
    left: track.start * pixelsPerSecond,
    width: Math.max(24, track.duration * pixelsPerSecond),
  };
  if (!track.color) return style;
  style.background = track.color;
  style.color = clipInk(track.color);
  style.opacity = selected ? 1 : 0.82;
  return style;
}

function TimelineClipSurface({
  track,
  selected,
  pixelsPerSecond,
  playheadSeconds,
  onSelect,
  onBeginDrag,
  onEdit,
  onSplit,
  onDelete,
}: {
  track: MediaTrack;
  selected: boolean;
  pixelsPerSecond: number;
  playheadSeconds: number;
  onSelect: (id: string) => void;
  onBeginDrag: (
    event: React.PointerEvent,
    track: MediaTrack,
    kind: "move" | "trim-start" | "trim-end",
  ) => void;
  onEdit?: ((id: string) => void) | undefined;
  onSplit: (track: MediaTrack) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ContextMenu onOpenChange={(open) => open && onSelect(track.id)}>
      <ContextMenuTrigger
        render={
          <div
            data-clip=""
            className={cn(
              "absolute rounded-md text-left text-sm",
              !track.color &&
                (selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground"),
              isAudibleKind(track.kind) && track.mute && "opacity-50",
            )}
            style={{
              ...clipSurfaceStyle(track, selected, pixelsPerSecond),
              top: 4,
              height: laneHeight(track.kind) - 2,
            }}
            onContextMenu={(event) => {
              event.stopPropagation();
              onSelect(track.id);
            }}
          />
        }
      >
        <button
          type="button"
          data-edge=""
          aria-label={`Shorten start of ${clipLabel(track)}`}
          className={cn(
            "absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize rounded-l-md",
            track.color
              ? clipInk(track.color) === "#F5F5F5"
                ? "bg-white/35 hover:bg-white/55"
                : "bg-black/25 hover:bg-black/45"
              : "bg-foreground/35 hover:bg-foreground/60",
          )}
          onPointerDown={(event) => onBeginDrag(event, track, "trim-start")}
        />
        <button
          type="button"
          className="absolute inset-0 truncate px-3 text-left"
          onPointerDown={(event) => onBeginDrag(event, track, "move")}
          onDoubleClick={() => {
            onSelect(track.id);
            if (track.kind === "block" || track.kind === "music") onEdit?.(track.id);
          }}
          aria-pressed={selected}
        >
          {clipLabel(track)}
        </button>
        <button
          type="button"
          data-edge=""
          aria-label={`Change length of ${clipLabel(track)}`}
          className={cn(
            "absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize rounded-r-md",
            track.color
              ? clipInk(track.color) === "#F5F5F5"
                ? "bg-white/35 hover:bg-white/55"
                : "bg-black/25 hover:bg-black/45"
              : "bg-foreground/35 hover:bg-foreground/60",
          )}
          onPointerDown={(event) => onBeginDrag(event, track, "trim-end")}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44" onClick={() => onSelect(track.id)}>
        {track.kind === "block" && (
          <ContextMenuItem onClick={() => onEdit?.(track.id)}>Edit code</ContextMenuItem>
        )}
        {track.kind === "music" && (
          <ContextMenuItem onClick={() => onEdit?.(track.id)}>Edit pattern</ContextMenuItem>
        )}
        <ContextMenuItem
          disabled={
            playheadSeconds <= track.start || playheadSeconds >= track.start + track.duration
          }
          onClick={() => onSplit(track)}
        >
          Split at playhead
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            onSelect(track.id);
            onDelete(track.id);
          }}
        >
          Delete clip
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function Timeline({
  composition,
  media,
  selectedTrackId,
  selectedMarkerId,
  collapsed,
  onExpand,
  onSeek,
  onPlayToggle,
  onLoopToggle,
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
  onSettings,
}: TimelineProps) {
  const playheadSeconds = useStudioStore((state) => state.playheadSeconds);
  const playing = useStudioStore((state) => state.playing);
  const loopPlayback = useStudioStore((state) => state.loopPlayback);
  const loopSeam = useStudioStore((state) => state.loopSeam);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<HTMLDivElement>(null);
  const [hiddenToolIds, setHiddenToolIds] = useState<string[]>([]);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(120);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [width, setWidth] = useState(640);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const drag = useRef<{
    kind: DragKind;
    id: string;
    originX: number;
    originY: number;
    originStart: number;
    originDuration: number;
    originTrim: number;
    originTime: number;
    originIndex: number;
  } | null>(null);
  const menuTime = useRef(0);
  const pendingClip = useRef<MediaTrack | null>(null);
  const pendingTracks = useRef<MediaTrack[] | null>(null);
  const originRows = useRef<MediaTrack[] | null>(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => setWidth(surface.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [collapsed]);
  useLayoutEffect(() => {
    const row = transportRef.current;
    const playback = playbackRef.current;
    if (!row || !playback) return;
    const sizes = [
      { id: "split", width: TRANSPORT_ICON, priority: 50 },
      { id: "delete", width: TRANSPORT_ICON, priority: 40 },
      { id: "marker", width: TRANSPORT_ICON, priority: 70 },
      { id: "block", width: TRANSPORT_ICON, priority: 90 },
      { id: "music", width: TRANSPORT_ICON, priority: 65 },
      { id: "settings", width: TRANSPORT_ICON, priority: 100 },
      ...(collapsed ? [{ id: "show", width: TRANSPORT_SHOW, priority: 110 }] : []),
    ];
    const measure = () => {
      const styles = getComputedStyle(row);
      const pad = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const available = row.clientWidth - pad - playback.offsetWidth - TRANSPORT_GAP;
      const next = partitionTransportTools(sizes, available, TRANSPORT_OVERFLOW, TRANSPORT_GAP);
      setHiddenToolIds((current) =>
        current.length === next.overflow.length &&
        current.every((id, index) => id === next.overflow[index])
          ? current
          : next.overflow,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [collapsed]);

  const tracks = [...media.tracks].toSorted(
    (a, b) => a.lane - b.lane || a.start - b.start || a.id.localeCompare(b.id),
  );
  const lanes = groupLanes(tracks);
  const insertY =
    dropIndex !== null && drag.current?.kind === "lane"
      ? dropLineOffset(lanes, drag.current.originIndex, dropIndex)
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
    const left = added.start * pixelsPerSecond;
    const right = left + Math.max(24, added.duration * pixelsPerSecond);
    if (left < surface.scrollLeft) surface.scrollLeft = Math.max(0, left - 16);
    else if (right > surface.scrollLeft + surface.clientWidth) {
      surface.scrollLeft = Math.max(0, right - surface.clientWidth + 16);
    }
    const top = rowOffset(lanes, laneIndex);
    const bottom = top + laneRowHeight(added.kind);
    if (top < surface.scrollTop) surface.scrollTop = top;
    else if (bottom > surface.scrollTop + surface.clientHeight) {
      surface.scrollTop = Math.max(0, bottom - surface.clientHeight);
    }
  }, [composition.id, pixelsPerSecond, tracks, lanes]);
  const duration = contentDuration(tracks);
  const extent = timelineExtent(tracks, duration, width / Math.max(1, pixelsPerSecond));
  const position = playheadSeconds * pixelsPerSecond;
  const surfaceWidth = Math.max(width, extent * pixelsPerSecond);
  const ticks = rulerTicks(extent, pixelsPerSecond, width, scrollLeft);
  const targets = snapTargets(tracks, media.markers, playheadSeconds, duration);

  const rawTimeAt = (clientX: number) => {
    const rect = (rulerRef.current ?? surfaceRef.current)?.getBoundingClientRect();
    if (!rect) return 0;
    return secondsFromX(clientX, rect.left, surfaceRef.current?.scrollLeft ?? 0, pixelsPerSecond);
  };

  const timeAt = (clientX: number) => Math.min(duration, rawTimeAt(clientX));

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

  const stepFrame = (direction: -1 | 1) => {
    const frame = frameFromTime(playheadSeconds, composition.fps, duration);
    const last = frameCount(duration, composition.fps) - 1;
    const next = Math.min(last, Math.max(0, frame + direction));
    onSeek(timeFromFrame(next, composition.fps));
  };

  const fit = () => {
    const next = clampZoom((width - 8) / Math.max(0.1, duration));
    setPixelsPerSecond(next);
  };

  const zoomBy = (factor: number) => {
    setPixelsPerSecond((current) => clampZoom(current * factor));
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

  const applyRows = (next: MediaTrack[], persist: boolean) => {
    pendingTracks.current = persist ? null : next;
    void onTracks?.(next, persist);
  };

  const onRulerPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-marker], [data-zoom]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(snapTime(timeAt(event.clientX), targets, TIMELINE_SNAP));
  };

  const onLanesPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-clip],[data-edge]")) return;
    selectTrack(null);
  };

  const beginClipDrag = (
    event: React.PointerEvent,
    track: MediaTrack,
    kind: "move" | "trim-start" | "trim-end",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    selectTrack(track.id);
    drag.current = {
      kind,
      id: track.id,
      originX: event.clientX,
      originY: event.clientY,
      originStart: track.start,
      originDuration: track.duration,
      originTrim: track.trimStart,
      originTime: 0,
      originIndex: lanes.findIndex((lane) => lane.clips.some((item) => item.id === track.id)),
    };
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
    drag.current = {
      kind: "lane",
      id: selected?.id ?? `lane-${laneIndex}`,
      originX: event.clientX,
      originY: event.clientY,
      originStart: selected?.start ?? 0,
      originDuration: selected?.duration ?? 0,
      originTrim: selected?.trimStart ?? 0,
      originTime: 0,
      originIndex: laneIndex,
    };
    originRows.current = tracks;
    setDropIndex(laneIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
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
      const markerTargets = snapTargets(
        tracks,
        media.markers.filter((item) => item.id !== marker.id),
        playheadSeconds,
        duration,
      );
      const target = activeSnap(raw, markerTargets, TIMELINE_SNAP);
      setSnapAt(target);
      void onMarker({ ...marker, timeSeconds: target ?? raw });
      return;
    }
    if (active.kind === "lane") {
      setSnapAt(null);
      const source = originRows.current ?? tracks;
      const sourceLanes = groupLanes(source);
      setDropIndex(
        rowIndexAtOffset(
          sourceLanes,
          rowOffset(sourceLanes, active.originIndex) + (event.clientY - active.originY),
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
    const ignore = snapTargets(tracks, media.markers, playheadSeconds, duration, track.id);
    const pullTo = (raw: number) => {
      const target = activeSnap(raw, ignore, TIMELINE_SNAP);
      setSnapAt(target);
      return target ?? raw;
    };
    followDrag(event.clientX);
    if (active.kind === "move") {
      const start = pullTo(active.originStart + delta);
      applyClip(
        { ...track, ...moveClipOnLane(origin, start, tracks, limits.maxDurationSeconds) },
        false,
      );
      return;
    }
    if (active.kind === "trim-start") {
      const start = pullTo(active.originStart + delta);
      applyClip({ ...track, ...trimClipStartOnLane(origin, start, tracks) }, false);
      return;
    }
    const end = pullTo(active.originStart + active.originDuration + delta);
    applyClip(
      { ...track, ...trimClipEndOnLane(origin, end, tracks, limits.maxDurationSeconds) },
      false,
    );
  };

  const onPointerUp = (event: React.PointerEvent) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    const active = drag.current;
    drag.current = null;
    setSnapAt(null);
    if (active?.kind === "lane") {
      const source = originRows.current ?? tracks;
      const nextIndex = dropIndex ?? active.originIndex;
      setDropIndex(null);
      if (nextIndex !== active.originIndex) {
        applyRows(reorderLanes(source, active.originIndex, nextIndex), true);
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

  const hiddenTools = new Set(hiddenToolIds);
  const toolVisible = (id: string) => !hiddenTools.has(id);
  const transportTools = [
    {
      id: "split",
      label: "Split at playhead",
      disabled: !selectedTrackId,
      icon: <ScissorsIcon />,
      onClick: splitSelected,
    },
    {
      id: "delete",
      label: "Delete clip",
      disabled: !selectedTrackId,
      destructive: true,
      icon: <TrashIcon />,
      onClick: () => deleteSelected(false),
    },
    {
      id: "marker",
      label: "Add marker",
      icon: <MapPinIcon />,
      onClick: () => placeMarker(playheadSeconds),
    },
    {
      id: "block",
      label: "Add block",
      icon: <SquaresPlusIcon />,
      onClick: () => onCreateBlock?.(playheadSeconds),
    },
    {
      id: "music",
      label: "Add music",
      icon: <MusicalNoteIcon />,
      onClick: () => onCreateMusic?.(playheadSeconds),
    },
    {
      id: "settings",
      label: "Composition settings",
      icon: <Cog6ToothIcon />,
      onClick: () => onSettings?.(),
    },
    ...(collapsed
      ? [
          {
            id: "show",
            label: "Show timeline",
            icon: null,
            onClick: onExpand,
          },
        ]
      : []),
  ];
  const overflowTools = transportTools.filter((tool) => hiddenTools.has(tool.id));

  const transport = (
    <div
      ref={transportRef}
      className="flex h-14 shrink-0 items-center gap-1 overflow-hidden px-2"
      aria-label="Transport"
    >
      <div ref={playbackRef} className="flex shrink-0 items-center gap-1">
        <Tip label="Go to start">
          <Button variant="ghost" size="icon" aria-label="Go to start" onClick={() => onSeek(0)}>
            <JumpStartIcon />
          </Button>
        </Tip>
        <Tip label="Previous frame">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous frame"
            onClick={() => stepFrame(-1)}
          >
            <BackwardIcon />
          </Button>
        </Tip>
        <Tip label={playing ? "Pause" : "Play"}>
          <Button
            variant="secondary"
            size="icon-lg"
            aria-label={playing ? "Pause" : "Play"}
            onClick={onPlayToggle}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
        </Tip>
        <Tip label="Next frame">
          <Button variant="ghost" size="icon" aria-label="Next frame" onClick={() => stepFrame(1)}>
            <ForwardIcon />
          </Button>
        </Tip>
        <Tip label="Go to end">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go to end"
            onClick={() => onSeek(duration)}
          >
            <JumpEndIcon />
          </Button>
        </Tip>
        <Tip label={loopPlayback ? "Disable loop" : "Enable loop"}>
          <Button
            variant={loopPlayback ? "secondary" : "ghost"}
            size="icon"
            aria-label={loopPlayback ? "Disable loop" : "Enable loop"}
            aria-pressed={loopPlayback}
            onClick={onLoopToggle}
          >
            <LoopIcon active={loopPlayback} />
          </Button>
        </Tip>
        <div className="ml-2 shrink-0 font-mono text-sm tabular-nums">
          <div>{formatTimecode(playheadSeconds, composition.fps)}</div>
          <div className="text-xs text-muted-foreground">
            {formatFrameIndex(playheadSeconds, composition.fps, duration)}
          </div>
        </div>
      </div>
      <div className="ml-auto flex min-w-0 items-center justify-end gap-1">
        {transportTools.map((tool) => {
          if (!toolVisible(tool.id)) return null;
          if (tool.id === "show") {
            return (
              <Tip key={tool.id} label={tool.label}>
                <Button variant="ghost" size="sm" aria-label={tool.label} onClick={tool.onClick}>
                  {tool.label}
                </Button>
              </Tip>
            );
          }
          return (
            <Tip key={tool.id} label={tool.label}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tool.label}
                disabled={tool.disabled}
                onClick={tool.onClick}
              >
                {tool.icon}
              </Button>
            </Tip>
          );
        })}
        {overflowTools.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="More tools" />}
            >
              <EllipsisHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 min-w-48 shadow-none">
              {overflowTools.map((tool, index) => (
                <Fragment key={tool.id}>
                  {index > 0 && (tool.id === "settings" || tool.id === "show") && (
                    <DropdownMenuSeparator />
                  )}
                  <DropdownMenuItem
                    variant={tool.destructive ? "destructive" : "default"}
                    disabled={tool.disabled}
                    onClick={tool.onClick}
                  >
                    {tool.icon}
                    {tool.label}
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <section
        className="flex shrink-0 flex-col bg-canvas-timeline"
        aria-label="Timeline"
        data-canvas="timeline"
      >
        {transport}
      </section>
    );
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-canvas-timeline"
      aria-label="Timeline"
      data-canvas="timeline"
    >
      {transport}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-28 shrink-0 flex-col border-r border-border">
          <div className="flex h-7 shrink-0 items-center border-b border-border px-2">
            <span className="truncate font-mono text-xs tabular-nums text-muted-foreground">
              <span title="Composition length">{formatLengthSeconds(duration)}</span>
              {loopSeam === null ? null : (
                <span
                  className={loopSeam ? "text-foreground" : undefined}
                  title={loopSeam ? "First and last frames match" : "First and last frames differ"}
                >
                  {" · "}
                  {loopSeam ? "Loop" : "Open"}
                </span>
              )}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="relative" style={{ transform: `translateY(${-scrollTop}px)` }}>
              {lanes.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">Drop a clip here</p>
              )}
              {lanes.map((lane, index) => {
                const selectedOnLane = lane.clips.some((clip) => clip.id === selectedTrackId);
                const muted = isAudibleKind(lane.kind) && lane.clips.every((clip) => clip.mute);
                return (
                  <button
                    type="button"
                    key={lane.lane}
                    data-lane={lane.lane}
                    className={cn(
                      "flex w-full cursor-ns-resize items-center gap-2 border-b border-border px-2 text-left text-sm transition-colors hover:bg-surface hover:transition-none",
                      selectedOnLane
                        ? "bg-surface text-foreground"
                        : index % 2 === 1
                          ? "bg-foreground/5 text-muted-foreground"
                          : "text-muted-foreground",
                      muted && "opacity-50",
                      dropIndex !== null && drag.current?.originIndex === index && "opacity-40",
                    )}
                    style={{ height: laneRowHeight(lane.kind) }}
                    onPointerDown={(event) => beginLaneDrag(event, index)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onClick={() => {
                      const clip =
                        lane.clips.find((item) => item.id === selectedTrackId) ?? lane.clips[0];
                      if (clip) selectTrack(clip.id);
                    }}
                    aria-pressed={selectedOnLane}
                  >
                    {lane.kind === "audio" ? (
                      muted ? (
                        <SpeakerXMarkIcon className="size-4 shrink-0" />
                      ) : (
                        <SpeakerWaveIcon className="size-4 shrink-0" />
                      )
                    ) : lane.kind === "music" ? (
                      <MusicalNoteIcon className="size-4 shrink-0" />
                    ) : isImageKind(lane.kind) ? (
                      <PhotoIcon className="size-4 shrink-0" />
                    ) : (
                      <PlayIcon className="size-4 shrink-0" />
                    )}
                    <span className="truncate">Track {index + 1}</span>
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
            className="relative h-7 shrink-0 cursor-ew-resize overflow-hidden border-b border-border"
            onPointerDown={onRulerPointer}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="absolute inset-y-0" style={{ left: -scrollLeft, width: surfaceWidth }}>
              {ticks.map((tick) => (
                <span
                  key={tick.time}
                  className="pointer-events-none absolute top-1 text-xs text-muted-foreground"
                  style={{ left: tick.x }}
                >
                  {tick.time.toFixed(tick.time < 2 ? 2 : 1)}s
                </span>
              ))}
              {media.markers.map((marker) => (
                <button
                  type="button"
                  data-marker=""
                  key={marker.id}
                  className={cn(
                    "absolute top-0 h-7 w-3 -translate-x-1/2 rounded-sm",
                    selectedMarkerId === marker.id ? "bg-foreground" : "bg-muted-foreground",
                  )}
                  style={{ left: marker.timeSeconds * pixelsPerSecond }}
                  title={marker.label}
                  aria-label={`Marker ${marker.label}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectMarker(marker.id);
                    drag.current = {
                      kind: "marker",
                      id: marker.id,
                      originX: event.clientX,
                      originY: event.clientY,
                      originStart: 0,
                      originDuration: 0,
                      originTrim: 0,
                      originTime: marker.timeSeconds,
                      originIndex: 0,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                />
              ))}
            </div>
          </div>
          <div
            data-zoom=""
            className="absolute top-0 right-0 z-30 flex h-7 items-center gap-0.5 border-l border-border bg-canvas-timeline pl-1.5 pr-1"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Tip label="Zoom out">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Zoom out"
                disabled={clampZoom(pixelsPerSecond * 0.8) === pixelsPerSecond}
                onClick={() => zoomBy(0.8)}
              >
                <MagnifyingGlassMinusIcon />
              </Button>
            </Tip>
            <Tip label="Zoom in">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Zoom in"
                disabled={clampZoom(pixelsPerSecond * 1.25) === pixelsPerSecond}
                onClick={() => zoomBy(1.25)}
              >
                <MagnifyingGlassPlusIcon />
              </Button>
            </Tip>
            <Tip label="Fit">
              <Button variant="ghost" size="xs" aria-label="Fit" onClick={fit}>
                Fit
              </Button>
            </Tip>
          </div>
          <div
            ref={surfaceRef}
            data-timeline-surface=""
            className="relative min-h-0 min-w-0 flex-1 overflow-auto"
            onPointerDown={onLanesPointer}
            onDragOver={(event) => {
              if (!onDropAsset || !event.dataTransfer.types.includes(LIBRARY_ASSET_MIME)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setSnapAt(rawTimeAt(event.clientX));
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setSnapAt(null);
            }}
            onDrop={(event) => {
              if (!onDropAsset) return;
              const asset = event.dataTransfer.getData(LIBRARY_ASSET_MIME);
              setSnapAt(null);
              if (!asset) return;
              event.preventDefault();
              const laneValue = (event.target as Element | null)
                ?.closest?.("[data-lane]")
                ?.getAttribute("data-lane");
              const lane =
                laneValue === null || laneValue === undefined ? undefined : Number(laneValue);
              onDropAsset(
                asset,
                rawTimeAt(event.clientX),
                Number.isFinite(lane) ? lane : undefined,
              );
            }}
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
                rect.left,
                event.currentTarget.scrollLeft,
                pixelsPerSecond,
              );
              const next = clampZoom(pixelsPerSecond * (event.deltaY < 0 ? 1.1 : 0.9));
              setPixelsPerSecond(next);
              event.currentTarget.scrollLeft = Math.max(
                0,
                cursor * next - (event.clientX - rect.left),
              );
            }}
          >
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <div
                    className="relative min-h-full min-w-full"
                    style={{ width: surfaceWidth }}
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
                {lanes.map((lane, index) => (
                  <ContextMenu key={lane.lane}>
                    <ContextMenuTrigger
                      render={
                        <div
                          data-lane={lane.lane}
                          className={cn(
                            "relative w-full border-b border-border",
                            index % 2 === 1 && "bg-foreground/5",
                            dropIndex !== null &&
                              drag.current?.kind === "lane" &&
                              drag.current.originIndex === index &&
                              "opacity-40",
                          )}
                          style={{ height: laneRowHeight(lane.kind) }}
                          onContextMenu={(event) => {
                            menuTime.current = rawTimeAt(event.clientX);
                            event.stopPropagation();
                          }}
                        />
                      }
                    >
                      {lane.clips.map((track) => (
                        <TimelineClipSurface
                          key={track.id}
                          track={track}
                          selected={selectedTrackId === track.id}
                          pixelsPerSecond={pixelsPerSecond}
                          playheadSeconds={playheadSeconds}
                          onSelect={selectTrack}
                          onBeginDrag={beginClipDrag}
                          onEdit={track.kind === "music" ? onEditMusic : onEditBlock}
                          onSplit={splitTrack}
                          onDelete={(id) => void onDeleteTrack?.(id)}
                        />
                      ))}
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      <ContextMenuItem onClick={() => onCreateBlock?.(menuTime.current, lane.lane)}>
                        Add block
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onCreateMusic?.(menuTime.current, lane.lane)}>
                        Add music
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => placeMarker(menuTime.current)}>
                        Add marker
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem onClick={() => onCreateBlock?.(menuTime.current)}>
                  Add block
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onCreateMusic?.(menuTime.current)}>
                  Add music
                </ContextMenuItem>
                {lanes.length > 0 && (
                  <ContextMenuItem
                    onClick={() => onCreateBlock?.(menuTime.current, nextLane(tracks))}
                  >
                    Add block on new track
                  </ContextMenuItem>
                )}
                {lanes.length > 0 && (
                  <ContextMenuItem
                    onClick={() => onCreateMusic?.(menuTime.current, nextLane(tracks))}
                  >
                    Add music on new track
                  </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => placeMarker(menuTime.current)}>
                  Add marker
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {snapAt !== null && (
              <span
                className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground"
                style={{ left: snapAt * pixelsPerSecond - scrollLeft }}
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
              className="pointer-events-auto absolute top-0 flex h-7 w-4 -translate-x-1/2 items-start justify-center"
              style={{ left: position - scrollLeft }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                onSeek(timeAt(event.clientX));
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <span
                className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-playhead"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
