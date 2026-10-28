import { useEffect, useState } from "react";
import {
  CodeBracketIcon,
  MusicalNoteIcon,
  ScissorsIcon,
  Square2StackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { CLIP_SWATCHES } from "@shared/clip-color.ts";
import { musicPatternPath } from "@shared/music-paths.ts";
import type { MediaTrack } from "@shared/schemas.ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { compositionAssetUrl, loopbackOrigin } from "@/lib/loopback.ts";
import { compositionFrameSrc, filmstripTiles } from "@/lib/thumbnails.ts";
import { clipInset, clipLabel, TIMELINE_INSET } from "@/lib/timeline-math.ts";
import { cn } from "@/lib/utils.ts";
import { PEAK_BINS_PER_SECOND, peaksFromChannels, waveBars } from "@/lib/waveform.ts";
import { useStudioStore } from "@/stores/studio.ts";

/** What part of the lanes is on screen, in surface pixels. */
export type LaneView = { scrollLeft: number; width: number };

export type ClipDragKind = "move" | "trim-start" | "trim-end";

/** Longer files are not decoded for a waveform; the clip stays plain. */
const WAVEFORM_MAX_SECONDS = 600;
const BAR = 2;
const BAR_STEP = 3;

const peakCache = new Map<string, Promise<Float32Array | null>>();

function decodePeaks(compositionId: string, asset: string): Promise<Float32Array | null> {
  const key = `${compositionId}/${asset}`;
  const cached = peakCache.get(key);
  if (cached) return cached;
  const job = (async () => {
    try {
      const probe = await window.studio.media.probe(compositionId, asset);
      if (probe.durationSeconds <= 0 || probe.durationSeconds > WAVEFORM_MAX_SECONDS) return null;
      const file = await window.studio.files.read(compositionId, `assets/${asset}`);
      if (file.encoding !== "base64") return null;
      const bytes = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));
      const context = new OfflineAudioContext(1, 1, 44_100);
      const audio = await context.decodeAudioData(bytes.buffer);
      const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
        audio.getChannelData(index),
      );
      return peaksFromChannels(channels, audio.sampleRate, PEAK_BINS_PER_SECOND);
    } catch {
      return null;
    }
  })();
  peakCache.set(key, job);
  return job;
}

/** The decoded peaks of an audio asset, or null while loading or when unavailable. */
function useAudioPeaks(compositionId: string, asset: string, enabled: boolean) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void decodePeaks(compositionId, asset).then((result) => {
      if (live) setPeaks(result);
    });
    return () => {
      live = false;
    };
  }, [asset, compositionId, enabled]);
  return enabled ? peaks : null;
}

/** Clip-local pixel range that is on screen. */
function visibleRange(left: number, width: number, view: LaneView): [number, number] {
  const from = Math.max(0, view.scrollLeft - left);
  const to = Math.min(width, view.scrollLeft + view.width - left);
  return [from, to];
}

function Waveform({
  track,
  compositionId,
  pixelsPerSecond,
  left,
  width,
  height,
  view,
}: {
  track: MediaTrack;
  compositionId: string;
  pixelsPerSecond: number;
  left: number;
  width: number;
  height: number;
  view: LaneView;
}) {
  const peaks = useAudioPeaks(compositionId, track.asset, true);
  if (!peaks) return null;
  const [from, to] = visibleRange(left, width, view);
  const first = Math.floor(from / BAR_STEP);
  const last = Math.ceil(to / BAR_STEP);
  if (last <= first) return null;
  const mediaAt = (x: number) => track.trimStart + (x / pixelsPerSecond) * track.rate;
  const bars = waveBars(
    peaks,
    PEAK_BINS_PER_SECOND,
    mediaAt(first * BAR_STEP),
    mediaAt(last * BAR_STEP),
    last - first,
  );
  const room = height - 10;
  return (
    <svg
      className="pointer-events-none absolute top-0 text-muted-foreground"
      style={{ left: first * BAR_STEP }}
      width={(last - first) * BAR_STEP}
      height={height}
      aria-hidden="true"
    >
      {bars.map((value, index) => {
        const bar = Math.max(2, Math.round(value * room));
        return (
          <rect
            // oxlint-disable-next-line react/no-array-index-key -- bars are positional
            key={index}
            x={index * BAR_STEP}
            y={(height - bar) / 2}
            width={BAR}
            height={bar}
            rx={1}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

/** One frame of the filmstrip; keeps showing the last frame while the next one loads. */
function FilmTile({ src, left, width }: { src: string; left: number; width: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="absolute inset-y-0 overflow-hidden" style={{ left, width }}>
      {!failed && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover object-left"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function Filmstrip({
  track,
  compositionId,
  pixelsPerSecond,
  left,
  width,
  height,
  view,
}: {
  track: MediaTrack;
  compositionId: string;
  pixelsPerSecond: number;
  left: number;
  width: number;
  height: number;
  view: LaneView;
}) {
  const composition = useStudioStore((state) => state.composition);
  const revision = useStudioStore((state) => state.thumbnailRevisions[compositionId] ?? 0);
  if (!composition) return null;
  const aspect = Math.min(3, Math.max(0.4, composition.width / composition.height));
  const [from, to] = visibleRange(left, width, view);
  const tiles = filmstripTiles({
    start: track.start,
    duration: track.duration,
    pixelsPerSecond,
    tileWidth: Math.round(height * aspect),
    visibleFrom: track.start + from / pixelsPerSecond,
    visibleTo: track.start + to / pixelsPerSecond,
    fps: composition.fps,
  });
  const pixels = Math.round(height * Math.min(2, window.devicePixelRatio || 1));
  return (
    <span className="clip-film pointer-events-none absolute inset-0" aria-hidden="true">
      {tiles.map((tile) => (
        <FilmTile
          key={tile.time}
          src={compositionFrameSrc(loopbackOrigin, compositionId, revision, tile.time, pixels)}
          left={tile.left}
          width={tile.width}
        />
      ))}
    </span>
  );
}

function ImageStrip({ track, compositionId }: { track: MediaTrack; compositionId: string }) {
  return (
    <span
      className="clip-film pointer-events-none absolute inset-0 bg-repeat-x"
      style={{
        backgroundImage: `url("${compositionAssetUrl(compositionId, track.asset)}")`,
        backgroundSize: "auto 100%",
      }}
      aria-hidden="true"
    />
  );
}

/** What is in a clip: frames for pictures, the waveform for sound. Music shows its name only. */
export function ClipContent(props: {
  track: MediaTrack;
  compositionId: string;
  pixelsPerSecond: number;
  left: number;
  width: number;
  height: number;
  view: LaneView;
}) {
  const { track } = props;
  if (track.kind === "block" || track.kind === "video") return <Filmstrip {...props} />;
  if (track.kind === "image")
    return <ImageStrip track={track} compositionId={props.compositionId} />;
  if (track.kind === "audio") return <Waveform {...props} />;
  return null;
}

/** The clip's name on a dark chip, with its swatch as a dot. */
function ClipLabel({ track }: { track: MediaTrack }) {
  const label = clipLabel(track);
  const pattern = track.kind === "music" ? musicPatternPath(track.asset).split("/").pop() : null;
  return (
    <span className="pointer-events-none absolute top-[5px] left-1.5 z-[2] flex h-5 max-w-[calc(100%-12px)] items-center gap-1.5 rounded-[6px] bg-black/62 pr-[7px] pl-1.5 text-[12px] leading-none font-medium tracking-[-0.005em] whitespace-nowrap text-[#f5f5f5]">
      {track.color && (
        <span
          className="size-2 shrink-0 rounded-[3px]"
          style={{ background: track.color }}
          aria-hidden="true"
        />
      )}
      <span className="truncate">
        {label}
        {pattern ? ` · ${pattern}` : ""}
      </span>
    </span>
  );
}

function Grip({ side, active, row }: { side: "start" | "end"; active: boolean; row: number }) {
  const inset = row >= 44 ? 9 : 7;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute rounded-[2px] bg-[#f5f5f5] opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/0.35)] transition-opacity duration-150 group-hover/clip:opacity-100 group-hover/clip:transition-none group-data-[selected=true]/clip:opacity-100",
        side === "start" ? "left-1" : "right-1",
        active && "w-1 opacity-100 shadow-[0_0_0_3px_rgb(0_0_0/0.45)]",
        !active && "w-[3px]",
      )}
      style={{ top: active ? inset - 3 : inset, bottom: active ? inset - 3 : inset }}
    />
  );
}

export function clipLeft(track: { start: number }, pixelsPerSecond: number): number {
  return TIMELINE_INSET + track.start * pixelsPerSecond;
}

export function clipWidth(track: { duration: number }, pixelsPerSecond: number): number {
  return Math.max(24, track.duration * pixelsPerSecond - 1);
}

/**
 * The cut-away part of a clip while its edge is dragged: a faint ghost of the
 * real content, so you can see what you are losing and drag back into it.
 */
export function ClipGhost({
  track,
  compositionId,
  pixelsPerSecond,
  row,
  view,
}: {
  track: MediaTrack;
  compositionId: string;
  pixelsPerSecond: number;
  row: number;
  view: LaneView;
}) {
  const left = clipLeft(track, pixelsPerSecond);
  const width = Math.max(1, track.duration * pixelsPerSecond);
  const top = clipInset(row);
  const height = row - top * 2;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden rounded-lg opacity-30 shadow-[inset_0_0_0_1px_var(--border)]"
      style={{ left, width, top, height }}
    >
      <ClipContent
        track={track}
        compositionId={compositionId}
        pixelsPerSecond={pixelsPerSecond}
        left={left}
        width={width}
        height={height}
        view={view}
      />
    </span>
  );
}

export function TimelineClip({
  track,
  compositionId,
  selected,
  pixelsPerSecond,
  playheadSeconds,
  row,
  view,
  activeEdge,
  onSelect,
  onBeginDrag,
  onEdit,
  onSplit,
  onDuplicate,
  onColor,
  onDelete,
}: {
  track: MediaTrack;
  compositionId: string;
  selected: boolean;
  pixelsPerSecond: number;
  playheadSeconds: number;
  row: number;
  view: LaneView;
  activeEdge: "start" | "end" | null;
  onSelect: (id: string) => void;
  onBeginDrag: (event: React.PointerEvent, track: MediaTrack, kind: ClipDragKind) => void;
  onEdit?: ((id: string) => void) | undefined;
  onSplit: (track: MediaTrack) => void;
  onDuplicate?: ((track: MediaTrack) => void) | undefined;
  onColor: (track: MediaTrack, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const label = clipLabel(track);
  const left = clipLeft(track, pixelsPerSecond);
  const width = clipWidth(track, pixelsPerSecond);
  const top = clipInset(row);
  const height = row - top * 2;
  const quiet = track.kind === "audio" || track.kind === "music";
  const canSplit = playheadSeconds > track.start && playheadSeconds < track.start + track.duration;
  const itemClass = "gap-2.5 px-2.5 py-2 [&_svg]:text-muted-foreground";
  return (
    <ContextMenu onOpenChange={(open) => open && onSelect(track.id)}>
      <ContextMenuTrigger
        render={
          <div
            data-clip=""
            data-selected={selected}
            className={cn(
              "group/clip absolute overflow-hidden rounded-lg text-left",
              quiet ? "bg-raised" : "bg-surface",
              // A muted video still shows in the picture, so only sound-only clips dim.
              quiet && track.mute && "opacity-50",
            )}
            style={{ left, width, top, height }}
            onContextMenu={(event) => {
              event.stopPropagation();
              onSelect(track.id);
            }}
          />
        }
      >
        <ClipContent
          track={track}
          compositionId={compositionId}
          pixelsPerSecond={pixelsPerSecond}
          left={left}
          width={width}
          height={height}
          view={view}
        />
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-default text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
          onPointerDown={(event) => onBeginDrag(event, track, "move")}
          onDoubleClick={() => {
            onSelect(track.id);
            if (track.kind === "block" || track.kind === "music") onEdit?.(track.id);
          }}
          aria-pressed={selected}
          aria-label={label}
        >
          <ClipLabel track={track} />
        </button>
        {selected && (
          <span
            className="pointer-events-none absolute inset-0 z-[3] rounded-lg shadow-[inset_0_0_0_2px_var(--foreground)]"
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          data-edge=""
          aria-label={`Shorten start of ${label}`}
          className="absolute inset-y-0 left-0 z-[4] w-2.5 cursor-ew-resize outline-none focus-visible:[&>span]:opacity-100"
          onPointerDown={(event) => onBeginDrag(event, track, "trim-start")}
        >
          <Grip side="start" active={activeEdge === "start"} row={row} />
        </button>
        <button
          type="button"
          data-edge=""
          aria-label={`Change length of ${label}`}
          className="absolute inset-y-0 right-0 z-[4] w-2.5 cursor-ew-resize outline-none focus-visible:[&>span]:opacity-100"
          onPointerDown={(event) => onBeginDrag(event, track, "trim-end")}
        >
          <Grip side="end" active={activeEdge === "end"} row={row} />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" onClick={() => onSelect(track.id)}>
        {track.kind === "block" && (
          <ContextMenuItem className={itemClass} onClick={() => onEdit?.(track.id)}>
            <CodeBracketIcon />
            Edit code
          </ContextMenuItem>
        )}
        {track.kind === "music" && (
          <ContextMenuItem className={itemClass} onClick={() => onEdit?.(track.id)}>
            <MusicalNoteIcon />
            Edit pattern
          </ContextMenuItem>
        )}
        <ContextMenuItem className={itemClass} disabled={!canSplit} onClick={() => onSplit(track)}>
          <ScissorsIcon />
          Split at playhead
        </ContextMenuItem>
        {onDuplicate && (
          <ContextMenuItem className={itemClass} onClick={() => onDuplicate(track)}>
            <Square2StackIcon />
            Duplicate
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <div className="px-2.5 pt-2 pb-1 text-[12px] font-medium text-dim">Colour</div>
        <div className="flex items-center gap-[7px] px-2.5 pt-0.5 pb-1.5">
          {CLIP_SWATCHES.map((color) => (
            <ContextMenuItem
              key={color}
              aria-label={`Colour ${color}`}
              className={cn(
                "size-[18px] shrink-0 rounded-[5px] p-0 focus:outline-2 focus:outline-offset-2 focus:outline-foreground",
                track.color?.toUpperCase() === color &&
                  "outline-2 outline-offset-2 outline-foreground",
              )}
              style={{ background: color }}
              onClick={() => onColor(track, color)}
            />
          ))}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          className={cn(itemClass, "[&_svg]:text-destructive")}
          onClick={() => {
            onSelect(track.id);
            onDelete(track.id);
          }}
        >
          <TrashIcon />
          Delete clip
          <span className="ml-auto font-mono text-[12px] text-dim">Del</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
