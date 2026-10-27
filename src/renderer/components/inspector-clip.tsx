import { useEffect, useMemo, useState } from "react";
import {
  CodeBracketIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ProbeResult } from "../../engine/probe.ts";
import { CLIP_SWATCHES } from "@shared/clip-color.ts";
import { neighborBounds, nextFreeStart } from "@shared/clips.ts";
import { limits } from "@shared/limits.ts";
import { isAssetKind, isAudibleKind, isImageKind } from "@shared/media.ts";
import { musicPatternPath } from "@shared/music-paths.ts";
import type { Composition, Marker, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import {
  PanelBody,
  PanelField,
  PanelHead,
  PanelSection,
  PanelTitle,
} from "@/components/inspector-parts.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { blockDirectory, blockPaths } from "@/lib/block-paths.ts";
import {
  clampClipDuration,
  clampInspectorNumber,
  formatClipTime,
  parseClipTime,
} from "@/lib/inspector-values.ts";
import { fileExtension, formatMediaLength } from "@/lib/library.ts";
import { clipLabel } from "@/lib/timeline-math.ts";
import { cn } from "@/lib/utils.ts";

const kindLabels = {
  audio: "Audio",
  video: "Video",
  image: "Image",
  block: "Block",
  music: "Music",
} satisfies Record<MediaTrack["kind"], string>;

function sliderNumber(value: number | readonly number[], fallback: number): number {
  if (Array.isArray(value)) return Number(value[0] ?? fallback);
  return Number(value);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label="Close, back to the project"
      onClick={onClose}
    >
      <XMarkIcon />
    </Button>
  );
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="mt-auto pt-2">
      <Button variant="destructive" size="sm" className="-ml-2.5" onClick={onDelete}>
        <TrashIcon />
        {label}
        <kbd className="ml-1.5 rounded-[5px] bg-secondary px-[5px] py-[3px] font-mono text-[12px] leading-none font-normal tracking-normal text-dim">
          Del
        </kbd>
      </Button>
    </div>
  );
}

function SwatchRow({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Clip colour">
      {CLIP_SWATCHES.map((color) => {
        const on = value?.toUpperCase() === color;
        return (
          <button
            type="button"
            key={color}
            aria-label={color}
            aria-pressed={on}
            className={cn(
              "size-[22px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on && "shadow-[0_0_0_2px_var(--canvas-inspector),0_0_0_4px_var(--foreground)]",
            )}
            style={{ background: color }}
            onClick={() => onChange(on ? undefined : color)}
          />
        );
      })}
    </div>
  );
}

/** Line counts of a document clip's files, read once per selection. */
function useFileLines(compositionId: string, paths: readonly string[]): Record<string, number> {
  const [lines, setLines] = useState<Record<string, number>>({});
  const key = paths.join("\n");
  useEffect(() => {
    let alive = true;
    setLines({});
    void Promise.all(
      key.split("\n").map(async (path) => {
        try {
          const file = await window.studio.files.read(compositionId, path);
          return [path, file.content === "" ? 0 : file.content.split("\n").length] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!alive) return;
      setLines(Object.fromEntries(results.filter((item) => item !== null)));
    });
    return () => {
      alive = false;
    };
  }, [compositionId, key]);
  return lines;
}

function SourceCode({
  compositionId,
  track,
  onEdit,
}: {
  compositionId: string;
  track: MediaTrack;
  onEdit: () => void;
}) {
  const paths = useMemo(() => {
    if (track.kind === "music") return [musicPatternPath(track.asset)];
    const dir = blockPaths(blockDirectory(track.asset));
    return [dir.html, dir.css, dir.js];
  }, [track.asset, track.kind]);
  const lines = useFileLines(compositionId, paths);
  return (
    <div>
      <Button
        variant="secondary"
        className="w-full justify-start gap-2 rounded-[10px] px-3"
        onClick={onEdit}
      >
        <CodeBracketIcon />
        {track.kind === "music" ? "Edit pattern" : "Edit code"}
      </Button>
      <div className="mt-2.5 grid">
        {paths.map((path) => {
          const count = lines[path];
          return (
            <div key={path} className="flex h-7 items-center gap-2.5 text-[13px]">
              <span className="min-w-0 truncate font-mono tracking-normal text-foreground">
                {path.slice(path.lastIndexOf("/") + 1)}
              </span>
              <span className="flex-1" />
              {count !== undefined && (
                <span className="font-mono text-[12px] tracking-normal text-dim">
                  {count} {count === 1 ? "line" : "lines"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useProbe(compositionId: string, track: MediaTrack): ProbeResult | null {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const probeable = isAssetKind(track.kind);
  useEffect(() => {
    let alive = true;
    setProbe(null);
    if (!probeable) return;
    window.studio.media
      .probe(compositionId, track.asset)
      .then((result) => {
        if (alive) setProbe(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [compositionId, probeable, track.asset]);
  return probe;
}

function sourceMeta(track: MediaTrack, probe: ProbeResult | null): string {
  const parts = [fileExtension(track.asset).toUpperCase() || kindLabels[track.kind]];
  if (probe && probe.durationSeconds > 0) parts.push(formatMediaLength(probe.durationSeconds));
  const video = probe?.streams.find((stream) => stream.codecType === "video");
  if (video?.width && video.height) parts.push(`${video.width} × ${video.height}`);
  return parts.join(" · ");
}

function SourceFile({ track, probe }: { track: MediaTrack; probe: ProbeResult | null }) {
  const Icon =
    track.kind === "video" ? FilmIcon : isImageKind(track.kind) ? PhotoIcon : MusicalNoteIcon;
  return (
    <div className="flex h-11 items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-raised text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{track.asset}</div>
        <div className="font-mono text-[12px] leading-[1.3] tracking-normal text-dim">
          {sourceMeta(track, probe)}
        </div>
      </div>
    </div>
  );
}

function SoundSection({
  track,
  onTrack,
}: {
  track: MediaTrack;
  onTrack: (track: MediaTrack, persist?: boolean) => Promise<void>;
}) {
  const values = useMemo(() => [track.volume], [track.volume]);
  return (
    <PanelSection title="Sound">
      <label className="flex h-11 items-center justify-between text-[13px] text-muted-foreground">
        Mute
        <Switch checked={track.mute} onCheckedChange={(mute) => void onTrack({ ...track, mute })} />
      </label>
      <div className="py-2">
        <div className="mb-2 flex h-5 items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Volume</span>
          <span className="font-mono tracking-normal tabular-nums">
            {Math.round(track.volume * 100)}%
          </span>
        </div>
        <Slider
          aria-label="Volume"
          value={values}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(value) =>
            void onTrack({ ...track, volume: sliderNumber(value, track.volume) }, false)
          }
          onValueCommitted={(value) =>
            void onTrack({ ...track, volume: sliderNumber(value, track.volume) }, true)
          }
          className="panel-slider"
        />
      </div>
    </PanelSection>
  );
}

/** The panel with a clip selected: the clip's name and colour, timing, sound and source. */
export function ClipPanel({
  composition,
  media,
  track,
  onClose,
  onTrack,
  onDelete,
  onEdit,
}: {
  composition: Composition;
  media: MediaDocument;
  track: MediaTrack;
  onClose: () => void;
  onTrack: (track: MediaTrack, persist?: boolean) => Promise<void>;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const probe = useProbe(composition.id, track);
  const label = clipLabel(track);
  const timed = isAssetKind(track.kind);
  const document = track.kind === "block" || track.kind === "music";
  // Video gets Sound only once its probe shows an audio stream.
  const sounds =
    isAudibleKind(track.kind) &&
    (track.kind !== "video" || probe?.streams.some((stream) => stream.codecType === "audio"));

  const commitStart = (draft: string) => {
    const parsed = parseClipTime(draft);
    if (parsed === null) return undefined;
    const start = nextFreeStart(
      media.tracks,
      track.lane,
      Math.min(limits.maxDurationSeconds - track.duration, Math.max(0, parsed)),
      track.duration,
      track.id,
    );
    void onTrack({ ...track, start });
    return formatClipTime(start);
  };
  const commitLength = (draft: string) => {
    const parsed = parseClipTime(draft);
    if (parsed === null) return undefined;
    const { nextStart } = neighborBounds(track, media.tracks);
    const maxEnd = Number.isFinite(nextStart) ? nextStart : limits.maxDurationSeconds;
    const duration = clampClipDuration(
      String(parsed),
      track.duration,
      composition.fps,
      maxEnd - track.start,
    );
    void onTrack({ ...track, duration });
    return formatClipTime(duration);
  };
  const commitTrim = (draft: string) => {
    const parsed = parseClipTime(draft);
    if (parsed === null) return undefined;
    const trimStart = Math.max(0, parsed);
    void onTrack({ ...track, trimStart });
    return formatClipTime(trimStart);
  };
  const commitRate = (draft: string) => {
    const rate = clampInspectorNumber(draft, track.rate, limits.minRate, limits.maxRate);
    void onTrack({ ...track, rate });
    return rate.toFixed(2);
  };

  return (
    <>
      <PanelHead tools={<CloseButton onClose={onClose} />}>
        {track.color && (
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: track.color }}
          />
        )}
        <PanelTitle>{label}</PanelTitle>
        <span className="shrink-0 text-[13px] text-dim">{kindLabels[track.kind]}</span>
      </PanelHead>
      <PanelBody className="gap-[26px]">
        {document && <SourceCode compositionId={composition.id} track={track} onEdit={onEdit} />}
        <div className="grid gap-3">
          <PanelField
            label="Name"
            value={label}
            commit={(draft) => {
              const name = draft.trim();
              if (name === "") return undefined;
              if (name !== label) void onTrack({ ...track, name });
              return name;
            }}
          />
          <SwatchRow value={track.color} onChange={(color) => void onTrack({ ...track, color })} />
        </div>
        <PanelSection title="Timing">
          <div className="grid grid-cols-2 gap-3">
            <PanelField
              label="Start"
              mono
              suffix="s"
              value={formatClipTime(track.start)}
              commit={commitStart}
            />
            <PanelField
              label="Length"
              mono
              suffix="s"
              value={formatClipTime(track.duration)}
              commit={commitLength}
            />
            {timed && (
              <>
                <PanelField
                  label="Trim in"
                  mono
                  suffix="s"
                  value={formatClipTime(track.trimStart)}
                  commit={commitTrim}
                />
                <PanelField
                  label="Rate"
                  mono
                  suffix="×"
                  value={track.rate.toFixed(2)}
                  commit={commitRate}
                />
              </>
            )}
          </div>
        </PanelSection>
        {sounds && <SoundSection track={track} onTrack={onTrack} />}
        {!document && (
          <PanelSection title="Source">
            <SourceFile track={track} probe={probe} />
          </PanelSection>
        )}
        <DeleteButton label="Delete clip" onDelete={onDelete} />
      </PanelBody>
    </>
  );
}

/** The panel with a marker selected. */
export function MarkerPanel({
  composition,
  marker,
  onClose,
  onMarker,
  onDelete,
}: {
  composition: Composition;
  marker: Marker;
  onClose: () => void;
  onMarker: (marker: Marker) => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <>
      <PanelHead tools={<CloseButton onClose={onClose} />}>
        <span aria-hidden="true" className="h-3 w-0.5 shrink-0 rounded-[1px] bg-foreground" />
        <PanelTitle>{marker.label}</PanelTitle>
        <span className="shrink-0 text-[13px] text-dim">Marker</span>
      </PanelHead>
      <PanelBody className="gap-[26px]">
        <div className="grid grid-cols-2 gap-3">
          <PanelField
            label="Label"
            value={marker.label}
            commit={(draft) => {
              const label = draft.trim();
              if (label === "") return undefined;
              if (label !== marker.label) void onMarker({ ...marker, label });
              return label;
            }}
          />
          <PanelField
            label="Time"
            mono
            suffix="s"
            value={formatClipTime(marker.timeSeconds)}
            commit={(draft) => {
              const parsed = parseClipTime(draft);
              if (parsed === null) return undefined;
              const timeSeconds = Math.min(composition.durationSeconds, Math.max(0, parsed));
              void onMarker({ ...marker, timeSeconds });
              return formatClipTime(timeSeconds);
            }}
          />
        </div>
        <DeleteButton label="Delete marker" onDelete={onDelete} />
      </PanelBody>
    </>
  );
}
