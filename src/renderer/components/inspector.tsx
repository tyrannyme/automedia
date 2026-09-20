import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  FilmIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PencilSquareIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  Square2StackIcon,
  SquaresPlusIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { CLIP_SWATCHES } from "@shared/clip-color.ts";
import type { ExportFile } from "@shared/ipc.ts";
import type { Composition, Control, MediaDocument, MediaTrack, Marker } from "@shared/schemas.ts";
import { Button } from "@/components/ui/button.tsx";
import { newLocalId } from "@/lib/ids.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { laneAccepts, neighborBounds, nextFreeStart } from "@shared/clips.ts";
import { contentDuration } from "@shared/duration.ts";
import { isAudibleKind, isDocumentKind, isImageKind } from "@shared/media.ts";
import { limits } from "@shared/limits.ts";
import { exportFormatLabel } from "@/lib/export-format.ts";
import { exportIsRunning, exportPhaseLabel, exportProgressPercent } from "@/lib/export-progress.ts";
import { clipLabel } from "@/lib/timeline-math.ts";
import { formatTimecode } from "@/lib/timecode.ts";
import {
  clampClipDuration,
  clampInspectorNumber,
  finiteNumber,
  formatInspectorNumber,
  minimumClipDuration,
} from "@/lib/inspector-values.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

type InspectorProps = {
  composition: Composition;
  media: MediaDocument;
  controls: Control[];
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  collapsed: boolean;
  onExpand: () => void;
  onSettings: () => void;
  onTrack: (track: MediaTrack, persist?: boolean) => Promise<void>;
  onDeleteTrack: (id: string) => Promise<void>;
  onMarker: (marker: Marker) => Promise<void>;
  onDeleteMarker: (id: string) => Promise<void>;
  onPreviewControl: (control: Control) => void;
  onControl: (control: Control) => void;
  onCreateBlock?: (start?: number, lane?: number) => void;
  onCreateMusic?: (start?: number, lane?: number) => void;
  onEditBlock?: () => void;
  onEditMusic?: () => void;
  exports?: ExportFile[];
  onRevealExport?: () => void;
};

function sliderNumber(value: number | readonly number[], fallback: number): number {
  if (Array.isArray(value)) return Number(value[0] ?? fallback);
  return Number(value);
}

function Field({
  label,
  value,
  type = "text",
  icon,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: string | number;
  type?: string;
  icon: React.ReactNode;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: string) => string | number | void;
}) {
  const display = type === "number" ? formatInspectorNumber(Number(value)) : String(value);
  const [draft, setDraft] = useState(display);
  useEffect(() => setDraft(display), [display]);
  const commit = () => {
    const committed = onCommit(draft);
    setDraft(
      committed === undefined
        ? display
        : type === "number"
          ? formatInspectorNumber(Number(committed))
          : String(committed),
    );
  };
  return (
    <div className="inspector-field">
      <Label className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="size-4 shrink-0 [&_svg]:size-4">{icon}</span>
        {label}
      </Label>
      <Input
        aria-label={label}
        type={type}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-surface hover:bg-muted"
      />
    </div>
  );
}

const sectionHead = {
  composition: "bg-inspector-head-composition",
  clip: "bg-inspector-head-clip",
  marker: "bg-inspector-head-marker",
  controls: "bg-inspector-head-controls",
  exports: "bg-inspector-head-library",
} as const;

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: keyof typeof sectionHead;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3
        className={cn(
          "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium",
          sectionHead[tone],
        )}
      >
        <span className="size-4 shrink-0 [&_svg]:size-4">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <SwatchIcon className="size-4 shrink-0" />
        Color
      </Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="No color"
          aria-pressed={!value}
          className={cn(
            "size-6 rounded-sm bg-surface transition-colors hover:bg-muted hover:transition-none",
            !value && "ring-2 ring-ring",
          )}
          onClick={() => onChange(undefined)}
        />
        {CLIP_SWATCHES.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={color}
            aria-pressed={value === color}
            className={cn("size-6 rounded-sm", value === color && "ring-2 ring-ring")}
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

export function Inspector({
  composition,
  media,
  controls,
  selectedTrackId,
  selectedMarkerId,
  collapsed,
  onExpand,
  onSettings,
  onTrack,
  onDeleteTrack,
  onMarker,
  onDeleteMarker,
  onPreviewControl,
  onControl,
  onCreateBlock,
  onCreateMusic,
  onEditBlock,
  onEditMusic,
  exports = [],
  onRevealExport,
}: InspectorProps) {
  const selected = media.tracks.find((track) => track.id === selectedTrackId);
  const selectedMarker = media.markers.find((marker) => marker.id === selectedMarkerId);
  const mode = useStudioStore((state) => state.mode);
  const editingCode = mode === "code";
  const editingMusic = mode === "music";
  const exportJob = useStudioStore((state) => state.exportJob);
  const activeExport =
    exportJob && exportJob.compositionId === composition.id && exportIsRunning(exportJob)
      ? exportJob
      : null;

  if (collapsed) {
    return (
      <aside
        className="flex h-full w-full flex-col items-center bg-canvas-inspector py-2"
        aria-label="Inspector"
        data-canvas="inspector"
      >
        <Button variant="ghost" size="icon" onClick={onExpand} aria-label="Show inspector">
          <ChevronDownIcon className="rotate-90" />
        </Button>
      </aside>
    );
  }

  const title = selected
    ? clipLabel(selected)
    : selectedMarker
      ? selectedMarker.label
      : composition.name;

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-canvas-inspector"
      aria-label="Inspector"
      data-canvas="inspector"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
          {selected ? (
            selected.kind === "audio" ? (
              <SpeakerWaveIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : selected.kind === "music" ? (
              <MusicalNoteIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : selected.kind === "block" ? (
              <Square2StackIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : isImageKind(selected.kind) ? (
              <PhotoIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FilmIcon className="size-4 shrink-0 text-muted-foreground" />
            )
          ) : selectedMarker ? (
            <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FilmIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{title}</span>
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSettings}
          aria-label="Composition settings"
        >
          <Cog6ToothIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-8 px-4 pt-1 pb-6">
          {selected ? (
            <Section title="Clip" tone="clip" icon={<PencilSquareIcon />}>
              <Field
                icon={<PencilSquareIcon />}
                label="Name"
                value={clipLabel(selected)}
                onCommit={(value) => {
                  const name = value.trim();
                  if (name.length === 0) return clipLabel(selected);
                  void onTrack({ ...selected, name });
                  return name;
                }}
              />
              {isDocumentKind(selected.kind) && (
                <ColorSwatches
                  value={selected.color}
                  onChange={(color) => void onTrack({ ...selected, color })}
                />
              )}
              <Field
                icon={<ClockIcon />}
                label="Start"
                type="number"
                value={selected.start}
                min={0}
                max={limits.maxDurationSeconds - selected.duration}
                step={1 / composition.fps}
                onCommit={(value) => {
                  const start = nextFreeStart(
                    media.tracks,
                    selected.lane,
                    clampInspectorNumber(
                      value,
                      selected.start,
                      0,
                      limits.maxDurationSeconds - selected.duration,
                    ),
                    selected.duration,
                    selected.id,
                  );
                  void onTrack({ ...selected, start });
                  return start;
                }}
              />
              <Field
                icon={<ClockIcon />}
                label="Length"
                type="number"
                value={selected.duration}
                min={minimumClipDuration(composition.fps)}
                max={limits.maxDurationSeconds - selected.start}
                step={1 / composition.fps}
                onCommit={(value) => {
                  const { nextStart } = neighborBounds(selected, media.tracks);
                  const maxEnd = Number.isFinite(nextStart) ? nextStart : limits.maxDurationSeconds;
                  const duration = clampClipDuration(
                    value,
                    selected.duration,
                    composition.fps,
                    maxEnd - selected.start,
                  );
                  void onTrack({ ...selected, duration });
                  return duration;
                }}
              />
              {selected.kind === "block" && !editingCode && (
                <Button variant="secondary" size="sm" onClick={() => onEditBlock?.()}>
                  <CodeBracketIcon /> Edit code
                </Button>
              )}
              {selected.kind === "music" && !editingMusic && (
                <Button variant="secondary" size="sm" onClick={() => onEditMusic?.()}>
                  <MusicalNoteIcon /> Edit pattern
                </Button>
              )}
              {isAudibleKind(selected.kind) && (
                <VolumeRow
                  volume={selected.volume}
                  mute={selected.mute}
                  onVolume={(volume, persist) => void onTrack({ ...selected, volume }, persist)}
                  onMute={(mute) => void onTrack({ ...selected, mute })}
                />
              )}
              <Collapsible>
                <CollapsibleTrigger
                  render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
                >
                  Advanced
                  <ChevronDownIcon className="size-3.5" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  <Field
                    icon={<ClockIcon />}
                    label="Trim start"
                    type="number"
                    value={selected.trimStart}
                    min={0}
                    step={1 / composition.fps}
                    onCommit={(value) => {
                      const trimStart = Math.max(0, finiteNumber(value, selected.trimStart));
                      void onTrack({ ...selected, trimStart });
                      return trimStart;
                    }}
                  />
                  <Field
                    icon={<AdjustmentsHorizontalIcon />}
                    label="Rate"
                    type="number"
                    value={selected.rate}
                    min={limits.minRate}
                    max={limits.maxRate}
                    step={0.05}
                    onCommit={(value) => {
                      const rate = clampInspectorNumber(
                        value,
                        selected.rate,
                        limits.minRate,
                        limits.maxRate,
                      );
                      void onTrack({ ...selected, rate });
                      return rate;
                    }}
                  />
                  <Field
                    icon={<Square2StackIcon />}
                    label="Lane"
                    type="number"
                    value={selected.lane}
                    min={0}
                    step={1}
                    onCommit={(value) => {
                      const requested = Math.max(0, Math.round(finiteNumber(value, selected.lane)));
                      const others = media.tracks.filter((item) => item.id !== selected.id);
                      const lane = laneAccepts(others, requested, selected.kind)
                        ? requested
                        : selected.lane;
                      const start = nextFreeStart(
                        media.tracks,
                        lane,
                        selected.start,
                        selected.duration,
                        selected.id,
                      );
                      void onTrack({ ...selected, lane, start });
                      return lane;
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void onDeleteTrack(selected.id)}
              >
                <TrashIcon /> Delete clip
              </Button>
            </Section>
          ) : selectedMarker ? (
            <Section title="Marker" tone="marker" icon={<MapPinIcon />}>
              <Field
                icon={<PencilSquareIcon />}
                label="Label"
                value={selectedMarker.label}
                onCommit={(value) => {
                  void onMarker({ ...selectedMarker, label: value });
                  return value;
                }}
              />
              <Field
                icon={<ClockIcon />}
                label="Time"
                type="number"
                value={selectedMarker.timeSeconds}
                min={0}
                max={composition.durationSeconds}
                step={1 / composition.fps}
                onCommit={(value) => {
                  const timeSeconds = clampInspectorNumber(
                    value,
                    selectedMarker.timeSeconds,
                    0,
                    composition.durationSeconds,
                  );
                  void onMarker({ ...selectedMarker, timeSeconds });
                  return timeSeconds;
                }}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void onDeleteMarker(selectedMarker.id)}
              >
                <TrashIcon /> Delete marker
              </Button>
            </Section>
          ) : (
            <Section title="Composition" tone="composition" icon={<FilmIcon />}>
              <p className="font-mono text-sm text-muted-foreground">
                {composition.width} × {composition.height} · {composition.fps} fps ·{" "}
                {formatTimecode(contentDuration(media.tracks), composition.fps)}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => onCreateBlock?.()}>
                  <SquaresPlusIcon /> Add block
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onCreateMusic?.()}>
                  <MusicalNoteIcon /> Add music
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void onMarker({
                      id: newLocalId("m"),
                      timeSeconds: useStudioStore.getState().playheadSeconds,
                      label: "Marker",
                    })
                  }
                >
                  <MapPinIcon /> Add marker
                </Button>
              </div>
            </Section>
          )}

          <Section title="Exports" tone="exports" icon={<ArrowDownTrayIcon />}>
            {activeExport && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm">{exportPhaseLabel(activeExport.phase)}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {exportFormatLabel(activeExport.format)}
                  </p>
                </div>
                <Progress
                  value={exportProgressPercent(activeExport)}
                  className="gap-0"
                  aria-label="Export progress"
                />
              </div>
            )}
            {exports.length === 0 && !activeExport ? (
              <p className="text-sm text-muted-foreground">No exports yet.</p>
            ) : exports.length > 0 ? (
              <ul className="space-y-1.5">
                {exports.map((file) => (
                  <li key={file.jobId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {file.fileName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {exportFormatLabel(file.format)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {exports.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onRevealExport?.()}>
                Reveal
              </Button>
            )}
          </Section>

          {controls.length > 0 && (
            <Section title="Controls" tone="controls" icon={<AdjustmentsHorizontalIcon />}>
              {controls.map((control) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  onPreview={onPreviewControl}
                  onCommit={onControl}
                />
              ))}
            </Section>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function VolumeRow({
  volume,
  mute,
  onVolume,
  onMute,
}: {
  volume: number;
  mute: boolean;
  onVolume: (volume: number, persist: boolean) => void;
  onMute: (mute: boolean) => void;
}) {
  const values = useMemo(() => [volume], [volume]);
  return (
    <>
      <div className="inspector-field">
        <Label className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          <SpeakerWaveIcon className="size-4 shrink-0" />
          Volume
        </Label>
        <Slider
          value={values}
          min={0}
          max={1}
          step={0.05}
          onValueChange={(value) => onVolume(sliderNumber(value, volume), false)}
          onValueCommitted={(value) => onVolume(sliderNumber(value, volume), true)}
          className="min-w-0 flex-1"
          aria-label="Volume"
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {formatInspectorNumber(volume)}
        </span>
      </div>
      <label className="flex h-9 items-center gap-2 pl-[7.5rem] text-sm text-muted-foreground">
        <Checkbox checked={mute} onCheckedChange={(checked) => onMute(checked === true)} />
        Mute
      </label>
    </>
  );
}

function ControlRow({
  control,
  onPreview,
  onCommit,
}: {
  control: Control;
  onPreview: (control: Control) => void;
  onCommit: (control: Control) => void;
}) {
  const [local, setLocal] = useState(control);
  const localRef = useRef(local);
  localRef.current = local;
  const sliding = useRef(false);
  useEffect(() => {
    if (sliding.current) return;
    setLocal((current) => {
      if (current.id === control.id && current.value === control.value) return current;
      return control;
    });
  }, [control]);
  const commit = (next: Control) => {
    setLocal(next);
    onCommit(next);
  };
  const values = useMemo(() => (local.type === "range" ? [local.value] : [0]), [local]);

  if (local.type === "range") {
    return (
      <div className="inspector-field">
        <Label className="flex w-28 shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <AdjustmentsHorizontalIcon className="size-4 shrink-0" />
          {local.label}
        </Label>
        <Slider
          aria-label={local.label}
          value={values}
          min={local.min}
          max={local.max}
          step={local.step}
          onValueChange={(value) => {
            if (localRef.current.type !== "range") return;
            sliding.current = true;
            const next = {
              ...localRef.current,
              value: sliderNumber(value, localRef.current.value),
            };
            setLocal(next);
            onPreview(next);
          }}
          onValueCommitted={(value) => {
            if (localRef.current.type !== "range") return;
            const next = {
              ...localRef.current,
              value: sliderNumber(value, localRef.current.value),
            };
            sliding.current = false;
            setLocal(next);
            onCommit(next);
          }}
          className="min-w-0 flex-1"
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {formatInspectorNumber(local.value)}
        </span>
      </div>
    );
  }
  if (local.type === "color") {
    return (
      <div className="inspector-field">
        <Label className="flex w-28 shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <SwatchIcon className="size-4 shrink-0" />
          {local.label}
        </Label>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={local.label}
                className="size-8 shrink-0 rounded-md border border-border"
                style={{ background: local.value }}
              />
            }
          />
          <PopoverContent align="start" className="w-56 shadow-none">
            <input
              aria-label={`${local.label} swatch`}
              type="color"
              value={local.value.slice(0, 7)}
              onChange={(event) => commit({ ...local, value: event.currentTarget.value })}
              className="h-9 w-full cursor-pointer bg-surface"
            />
            <Input
              aria-label={`${local.label} hex`}
              className="bg-surface"
              value={local.value}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setLocal({ ...local, value });
                if (/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)) {
                  onCommit({ ...local, value });
                }
              }}
            />
          </PopoverContent>
        </Popover>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {local.value}
        </span>
      </div>
    );
  }
  if (local.type === "toggle") {
    return (
      <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={local.value}
          onCheckedChange={(value) => commit({ ...local, value: value === true })}
        />
        {local.label}
      </label>
    );
  }
  return (
    <div className="inspector-field">
      <Label className="w-28 shrink-0 text-sm text-muted-foreground">{local.label}</Label>
      <Select
        value={local.value}
        onValueChange={(value) => value !== null && commit({ ...local, value })}
      >
        <SelectTrigger
          aria-label={local.label}
          className="min-w-0 flex-1 bg-surface hover:bg-muted"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {local.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
