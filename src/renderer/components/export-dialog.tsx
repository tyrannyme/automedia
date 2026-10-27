import { nextExportFileName } from "@shared/export-name.ts";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  FolderOpenIcon,
  GifIcon,
  InformationCircleIcon,
  MusicalNoteIcon,
  PhotoIcon,
  RectangleStackIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  CheckCircleIcon,
  FilmIcon as FilmSolidIcon,
  GifIcon as GifSolidIcon,
  MusicalNoteIcon as MusicalNoteSolidIcon,
  PauseIcon,
  PhotoIcon as PhotoSolidIcon,
  PlayIcon,
  RectangleStackIcon as RectangleStackSolidIcon,
  SpeakerWaveIcon as SpeakerWaveSolidIcon,
} from "@heroicons/react/24/solid";
import type { ExportJob } from "../../engine/export.ts";
import { frameCount } from "@shared/clock.ts";
import {
  exportExpectsAudio,
  exportNeedsQuality,
  isAudioExportFormat,
  isVideoExportFormat,
} from "@shared/media.ts";
import type { Composition, ExportFormat } from "@shared/schemas.ts";
import type { ExportFile } from "@shared/ipc.ts";
import { ProjectPoster } from "@/components/project-poster.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import {
  audibleTrackNames,
  defaultExportFormat,
  exactExportBytes,
  exportAge,
  exportBlocks,
  exportChecks,
  exportFormatBlock,
  exportFormatGroups,
  exportFormatLabel,
  exportFormatLine,
  exportGroupNote,
  exportQualityLabel,
  exportSoundLine,
  exportSpecLine,
  formatBytes,
  type ExportBlock,
  type ExportFix,
} from "@/lib/export-format.ts";
import {
  exportDialogView,
  exportIsRunning,
  exportFrames,
  exportPace,
  exportPhaseLabel,
  exportProgressPercent,
  exportSteps,
  recordExportTiming,
  type ExportStep,
  type ExportTiming,
} from "@/lib/export-progress.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";
import { loopbackOrigin } from "@/lib/loopback.ts";
import { compositionFrameSrc } from "@/lib/thumbnails.ts";

type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: ExportJob | null;
  jobs?: ExportJob[];
  lastFormat: ExportFormat;
  errorMessage: string | null;
  onStart: (input: {
    format: ExportFormat;
    quality?: number;
    timeSeconds?: number;
  }) => Promise<void>;
  onCancel: () => void;
  onReveal: () => void;
  onSaveCopy: () => void;
  /** Opens composition settings, where the background is set. */
  onOpenSettings?: () => void;
  followJobId?: string | null;
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const formatIcons = {
  mp4: [FilmIcon, FilmSolidIcon],
  webm: [FilmIcon, FilmSolidIcon],
  png: [PhotoIcon, PhotoSolidIcon],
  gif: [GifIcon, GifSolidIcon],
  webp: [RectangleStackIcon, RectangleStackSolidIcon],
  mp3: [MusicalNoteIcon, MusicalNoteSolidIcon],
  wav: [SpeakerWaveIcon, SpeakerWaveSolidIcon],
  ogg: [MusicalNoteIcon, MusicalNoteSolidIcon],
} satisfies Record<ExportFormat, readonly [Icon, Icon]>;

export function ExportDialog({
  open,
  onOpenChange,
  job,
  jobs = [],
  lastFormat,
  errorMessage,
  onStart,
  onCancel,
  onReveal,
  onSaveCopy,
  onOpenSettings,
  followJobId = null,
}: ExportDialogProps) {
  const composition = useStudioStore((state) => state.composition);
  const tracks = useStudioStore((state) => state.media.tracks);
  const compositions = useStudioStore((state) => state.compositions);
  const exportFiles = useStudioStore((state) => state.exports);
  const playheadSeconds = useStudioStore((state) => (open ? state.playheadSeconds : 0));
  const [format, setFormat] = useState<ExportFormat>(lastFormat);
  const [quality, setQuality] = useState(80);
  const [followId, setFollowId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [timings, setTimings] = useState<Record<string, ExportTiming>>({});
  const view = exportDialogView(job, followId);
  const blocks = exportBlocks(composition, tracks);
  const blockKey = `${Boolean(blocks.video)}-${Boolean(blocks.webp)}-${Boolean(blocks.audio)}`;

  // Timing is the studio's own record of when it saw each phase, kept while closed too.
  useEffect(() => {
    const seen = job ? [job, ...jobs.filter((item) => item.id !== job.id)] : jobs;
    if (seen.length === 0) return;
    setTimings((current) => {
      const now = Date.now();
      let next = current;
      for (const item of seen) {
        const recorded = recordExportTiming(current[item.id], item, now);
        if (recorded !== current[item.id]) next = { ...next, [item.id]: recorded };
      }
      return next;
    });
  }, [job, jobs]);

  useEffect(() => {
    if (!open) {
      setFollowId(null);
      return;
    }
    if (job && exportIsRunning(job)) setFollowId(job.id);
    else if (followJobId) setFollowId(followJobId);
  }, [followJobId, job, open]);

  useEffect(() => {
    if (!open || view !== "setup") return;
    setFormat(defaultExportFormat(lastFormat, exportBlocks(composition, tracks)));
    // blockKey stands in for the blocks object, which is new every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFormat, blockKey, open, view]);

  const start = (next: ExportFormat) => {
    const input = exportNeedsQuality(next)
      ? { format: next, quality }
      : next === "png"
        ? { format: next, timeSeconds: playheadSeconds }
        : { format: next };
    setStarting(true);
    void onStart(input).finally(() => setStarting(false));
  };

  const applyFix = (fix: ExportFix) => {
    if (fix.kind === "background") {
      onOpenChange(false);
      onOpenSettings?.();
      return;
    }
    void useStudioStore.getState().updateSettings({ width: fix.width, height: fix.height });
  };

  const timing = job ? timings[job.id] : undefined;
  const hasSound = exportExpectsAudio(tracks);
  const name = composition?.name ?? "";
  const label = exportFormatLabel(job && view !== "setup" ? job.format : format);

  let title: ReactNode = "Export";
  let lead: ReactNode = null;
  let facts: string[] = [];
  if (view === "setup" && composition) {
    facts = [
      `${composition.width} × ${composition.height}`,
      composition.background === "transparent" ? "transparent" : `${composition.fps} fps`,
      `${composition.durationSeconds.toFixed(1)} s`,
    ];
  } else if (view === "running" && job) {
    title = "Exporting";
    facts = [label, ...(job.quality !== undefined ? [qualityFact(job.format, job.quality)] : [])];
  } else if (view === "ready" && job) {
    title = "Ready";
    lead = <CheckCircleIcon className="size-5 shrink-0 text-foreground" aria-hidden="true" />;
    const took = timing?.endedAt ? (timing.endedAt - timing.startedAt) / 1000 : null;
    facts = [label, ...(took !== null ? [`made in ${took.toFixed(1)} s`] : [])];
  } else if (view === "failed" && job) {
    title = "Export failed";
    lead = (
      <ExclamationTriangleIcon className="size-5 shrink-0 text-destructive" aria-hidden="true" />
    );
    const stopped = timing?.lastRunning;
    facts = [
      label,
      ...(stopped && stopped !== "queued" ? [`stopped at ${exportPhaseLabel(stopped)}`] : []),
    ];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-export-dialog=""
        initialFocus={focusPrimary}
        data-export-view={view}
        data-export-format={format}
      >
        <header className="flex h-16 shrink-0 items-center gap-3 pr-3 pl-6">
          {lead}
          <DialogTitle className="text-[17px] tracking-[-0.02em]">{title}</DialogTitle>
          <span className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap">
            {name && <span className="truncate text-sm text-muted-foreground">{name}</span>}
            {facts.map((fact) => (
              <span key={fact} className="flex gap-2 font-mono text-[13px] text-dim">
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
                {fact}
              </span>
            ))}
          </span>
          <span className="min-w-0 flex-1" />
          <CloseButton running={view === "running"} />
        </header>

        <div
          key={view}
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,520fr)_minmax(272px,328fr)] items-start gap-6 overflow-y-auto px-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        >
          {view === "setup" && composition && (
            <SetupView
              composition={composition}
              format={format}
              quality={quality}
              playheadSeconds={playheadSeconds}
              takenNames={exportFiles.map((file) => file.fileName)}
              hasSound={hasSound}
              audible={audibleTrackNames(tracks)}
              blocks={blocks}
              onFormat={setFormat}
              onQuality={setQuality}
              onFix={applyFix}
            />
          )}
          {view === "running" && job && composition && (
            <RunningView
              job={job}
              jobs={jobs}
              timing={timing}
              composition={composition}
              compositions={compositions}
              files={exportFiles}
            />
          )}
          {view === "ready" && job && composition && (
            <ReadyView
              job={job}
              composition={composition}
              hasSound={hasSound}
              file={exportFiles.find((file) => file.jobId === job.id) ?? null}
            />
          )}
          {view === "failed" && job && composition && (
            <FailedView job={job} timing={timing} composition={composition} />
          )}
        </div>

        <footer className="flex h-[72px] shrink-0 items-center gap-2 pr-5 pl-6">
          {view === "setup" && (
            <>
              {errorMessage ? (
                <p role="alert" className="min-w-0 truncate text-[13px] text-destructive">
                  {errorMessage}
                </p>
              ) : (
                <Note>
                  {exactExportBytes(format, composition ?? { durationSeconds: 0 }) !== null
                    ? "WAV's size is exact: 16-bit stereo at 48 kHz."
                    : "Sizes show only where they are exact."}
                </Note>
              )}
              <span className="min-w-0 flex-1" />
              <DialogClose render={<Button variant="ghost" size="sm" />}>Cancel</DialogClose>
              <Button
                size="sm"
                data-export-primary=""
                onClick={() => start(format)}
                disabled={starting || exportFormatBlock(format, blocks) !== null || !composition}
              >
                {starting ? "Starting" : `Export ${exportFormatLabel(format)}`}
              </Button>
            </>
          )}
          {view === "running" && (
            <>
              <Button variant="destructive" size="sm" onClick={onCancel}>
                Cancel export
              </Button>
              <span className="min-w-0 flex-1" />
              <Note className="mr-2 hidden min-[880px]:flex">
                Closing keeps it running. Export in the titlebar brings it back.
              </Note>
              <DialogClose render={<Button size="sm" data-export-primary="" />}>
                Keep working
              </DialogClose>
            </>
          )}
          {view === "ready" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setFollowId(null)}>
                <ArrowPathIcon />
                Export again
              </Button>
              <span className="min-w-0 flex-1" />
              <Note className="mr-2 hidden min-[880px]:flex">
                Also in the project's Exports list.
              </Note>
              <Button variant="secondary" size="sm" onClick={onSaveCopy}>
                <DocumentDuplicateIcon />
                Save copy
              </Button>
              <Button size="sm" data-export-primary="" onClick={onReveal}>
                <FolderOpenIcon />
                Reveal
              </Button>
            </>
          )}
          {view === "failed" && (
            <>
              <DialogClose render={<Button variant="ghost" size="sm" />}>Close</DialogClose>
              <span className="min-w-0 flex-1" />
              <Button
                data-export-primary=""
                size="sm"
                onClick={() => {
                  setFollowId(null);
                  if (job) {
                    setFormat(job.format);
                    if (job.quality !== undefined) setQuality(job.quality);
                    start(job.format);
                  }
                }}
              >
                <ArrowPathIcon />
                Try again
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** Opens on the primary action, so Enter does the likely thing; falls back to the first control. */
function focusPrimary(): HTMLElement | true {
  const primary = document.querySelector<HTMLElement>(
    "[data-export-dialog] [data-export-primary]:not(:disabled)",
  );
  return primary ?? true;
}

function qualityFact(format: ExportFormat, quality: number): string {
  return format === "webp" ? `effort ${quality}` : `quality ${quality}`;
}

function CloseButton({ running }: { running: boolean }) {
  const close = (
    <DialogClose
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={running ? "Close, the export keeps going" : "Close"}
        />
      }
    >
      <XMarkIcon />
    </DialogClose>
  );
  if (!running) return close;
  return (
    <Tooltip>
      <TooltipTrigger delay={200} render={<span className="inline-flex" />}>
        {close}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        Close · the export keeps going
      </TooltipContent>
    </Tooltip>
  );
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-center gap-2 text-[12px] text-dim", className)}>
      <InformationCircleIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </p>
  );
}

/** The composition's frame at its aspect, in a stage-coloured well. */
function Hero({
  composition,
  children,
  className,
  dimmed = false,
  timeSeconds,
}: {
  composition: Composition;
  children?: ReactNode;
  className?: string;
  dimmed?: boolean;
  /** Shows the frame at this time instead of the project poster. */
  timeSeconds?: number;
}) {
  const revision = useStudioStore((state) => state.thumbnailRevisions[composition.id] ?? 0);
  const ratio = composition.width / composition.height;
  const transparent = composition.background === "transparent";
  return (
    <div
      className={cn(
        "relative grid h-(--well-h) place-items-center overflow-hidden rounded-xl bg-canvas-preview p-4 [--well-h:clamp(160px,calc(100vh-428px),292px)]",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden outline outline-1 outline-foreground/10 shadow-(--dialog-hero-shadow)",
          transparent && "chequer",
          dimmed && "opacity-45",
        )}
        style={{ aspectRatio: ratio, width: `min(100%, calc((var(--well-h) - 32px) * ${ratio}))` }}
      >
        <ProjectPoster
          composition={composition}
          className={cn(
            "absolute inset-0 size-full rounded-none outline-0",
            transparent && "bg-transparent",
          )}
        />
        {timeSeconds !== undefined && (
          <img
            alt=""
            draggable={false}
            className="absolute inset-0 size-full object-cover"
            src={compositionFrameSrc(loopbackOrigin, composition.id, revision, timeSeconds, 240)}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}

function SetupView({
  composition,
  format,
  quality,
  playheadSeconds,
  takenNames,
  hasSound,
  audible,
  blocks,
  onFormat,
  onQuality,
  onFix,
}: {
  composition: Composition;
  format: ExportFormat;
  quality: number;
  playheadSeconds: number;
  takenNames: readonly string[];
  hasSound: boolean;
  audible: string[];
  blocks: ReturnType<typeof exportBlocks>;
  onFormat: (format: ExportFormat) => void;
  onQuality: (quality: number) => void;
  onFix: (fix: ExportFix) => void;
}) {
  const context = { composition, hasSound, quality, playheadSeconds };
  const exact = exactExportBytes(format, composition);
  const transparent = composition.background === "transparent";
  return (
    <>
      <div className="min-w-0 pb-2">
        <Hero composition={composition} timeSeconds={playheadSeconds} />
        <div className="mt-[18px]">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-[15px] font-medium tracking-[-0.015em]">
              {nextExportFileName(
                composition.name,
                format,
                takenNames,
                format === "png" ? Math.round(playheadSeconds * composition.fps) : undefined,
              )}
            </span>
            <span className="min-w-0 flex-1" />
            {exact !== null && <span className="font-mono text-[15px]">{formatBytes(exact)}</span>}
          </div>
          <p className="mt-1.5 font-mono text-[12px] leading-[1.3] text-dim">
            {exportSpecLine(format, context)}
          </p>
        </div>
        <div className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-raised px-3 text-[13px]">
          <FolderOpenIcon className="size-4 shrink-0 text-faint" aria-hidden="true" />
          <span className="min-w-0 truncate">Saves to Exports in {composition.name}</span>
        </div>
      </div>
      <div className="min-w-0 pb-4" role="radiogroup" aria-label="Export format">
        {exportFormatGroups.map((group) => {
          const groupBlock =
            group.id === "video" ? blocks.video : group.id === "audio" ? blocks.audio : null;
          const note = exportGroupNote(group.id, { transparent, audible });
          return (
            <section key={group.id} className="not-first:mt-2.5">
              <h3 className="flex h-[26px] items-center justify-between pr-2.5 pl-2 text-[12px] font-medium text-muted-foreground">
                <span>{group.label}</span>
                {!(group.id === "audio" && groupBlock) && (
                  <span className="font-normal text-dim">{note}</span>
                )}
              </h3>
              {groupBlock && (
                <BlockNotice block={groupBlock} audio={group.id === "audio"} onFix={onFix} />
              )}
              {!(group.id === "audio" && groupBlock) &&
                group.formats.map((item) => (
                  <FormatOption
                    key={item}
                    format={item}
                    line={exportFormatLine(item, context)}
                    size={exactExportBytes(item, composition)}
                    selected={item === format}
                    block={exportFormatBlock(item, blocks)}
                    quality={quality}
                    onSelect={() => onFormat(item)}
                    onQuality={onQuality}
                  />
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function BlockNotice({
  block,
  audio,
  onFix,
}: {
  block: ExportBlock;
  audio: boolean;
  onFix: (fix: ExportFix) => void;
}) {
  const Icon = audio ? SpeakerXMarkIcon : ExclamationCircleIcon;
  return (
    <div
      className={cn(
        "mb-1 flex gap-2.5 rounded-lg bg-dialog-well px-3 py-2.5 text-[13px] leading-[1.45]",
        audio && "items-center",
      )}
    >
      <Icon
        className={cn("size-[18px] shrink-0 text-muted-foreground", !audio && "mt-px")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        {audio ? (
          <p className="text-muted-foreground">
            {block.title} {block.detail}
          </p>
        ) : (
          <>
            <p className="text-foreground">{block.title}</p>
            <p className="text-muted-foreground">{block.detail}</p>
          </>
        )}
        {block.fix && (
          <div className="mt-2 flex gap-1.5">
            <Button variant="secondary" size="xs" onClick={() => onFix(block.fix!)}>
              {block.fix.kind === "background"
                ? "Set a background"
                : `Make it ${block.fix.width} × ${block.fix.height}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormatOption({
  format,
  line,
  size,
  selected,
  block,
  quality,
  onSelect,
  onQuality,
}: {
  format: ExportFormat;
  line: string;
  size: number | null;
  selected: boolean;
  block: ExportBlock | null;
  quality: number;
  onSelect: () => void;
  onQuality: (quality: number) => void;
}) {
  const [Outline, Solid] = formatIcons[format];
  const Icon = selected ? Solid : Outline;
  const qualityLabel = selected && !block ? exportQualityLabel(format) : null;
  return (
    <div className={cn("rounded-[10px]", selected && !block && "bg-dialog-selected")}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={exportFormatLabel(format)}
        disabled={block !== null}
        onClick={onSelect}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-[10px] pr-3 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40",
          !selected && "hover:bg-dialog-well",
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg bg-dialog-selected text-muted-foreground",
            selected && !block && "bg-foreground text-background",
          )}
        >
          <Icon className={selected ? "size-[18px]" : "size-4"} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[1.2] font-medium">
            {exportFormatLabel(format)}
          </span>
          <span
            className={cn(
              "block truncate font-mono text-[12px] leading-[1.3] text-dim",
              selected && "text-muted-foreground",
            )}
          >
            {/* Video's reason sits in its group notice; WebP's own limit says itself here. */}
            {block ? (format === "webp" ? block.title : line.split(" · ")[0]) : line}
          </span>
        </span>
        <span
          className={cn(
            "font-mono text-[12px] text-muted-foreground",
            selected && "text-foreground",
          )}
        >
          {block ? "—" : size !== null ? formatBytes(size) : ""}
        </span>
      </button>
      {qualityLabel && (
        <div className="pr-3 pb-2.5 pl-[50px]">
          <div className="flex h-5 items-center justify-between text-[12px]">
            <span className="text-muted-foreground">{qualityLabel}</span>
            <span className="font-mono">{quality}</span>
          </div>
          <Slider
            value={[quality]}
            min={1}
            max={100}
            step={1}
            onValueChange={(value) => onQuality(Array.isArray(value) ? Number(value[0]) : quality)}
            aria-label={qualityLabel}
            className="[&_[data-slot=slider-track]]:bg-dialog-surface-2"
          />
        </div>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: ExportStep[] }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Export phases">
      {steps.map((step) => (
        <li key={step.phase} className="min-w-0 text-[12px] text-dim" data-step-state={step.state}>
          <div className="relative mb-2 h-[3px] overflow-hidden rounded-[2px] bg-dialog-selected">
            <i
              className={cn(
                "absolute inset-y-0 left-0 bg-foreground transition-[width] duration-300",
                step.state === "bad" && "bg-destructive",
              )}
              style={{ width: `${step.fill}%` }}
            />
          </div>
          <div
            className={cn(
              "flex items-center gap-[5px] truncate font-medium text-muted-foreground",
              (step.state === "done" || step.state === "now") && "text-foreground",
              step.state === "bad" && "text-destructive",
            )}
          >
            {step.state === "done" && <CheckMark />}
            {step.state === "bad" && <XMarkIcon className="size-3 shrink-0" aria-hidden="true" />}
            {step.label}
          </div>
          <div className="mt-[3px] truncate font-mono">{step.detail}</div>
        </li>
      ))}
    </ol>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

function RunningView({
  job,
  jobs,
  timing,
  composition,
  compositions,
  files,
}: {
  job: ExportJob;
  jobs: ExportJob[];
  timing: ExportTiming | undefined;
  composition: Composition;
  compositions: Composition[];
  files: ExportFile[];
}) {
  const now = useNow(true);
  const frames = exportFrames(job);
  const pace = exportPace(job, timing, now);
  // While frames are counted, the bar is the frames; before and after, the phases.
  const percent =
    frames && job.phase === "capturing"
      ? Math.round((frames.frame / frames.frames) * 100)
      : exportProgressPercent(job);
  const total =
    isAudioExportFormat(job.format) || job.format === "png"
      ? null
      : frameCount(composition.durationSeconds, composition.fps);
  const active = [job, ...jobs.filter((item) => item.id !== job.id && exportIsRunning(item))];
  const waiting = active.filter((item) => item.phase === "queued").length;
  return (
    <>
      <div className="min-w-0 pb-2">
        <Hero composition={composition}>
          <span
            className="absolute inset-y-0 right-0 bg-canvas-preview/70"
            style={{ left: `${percent}%` }}
            aria-hidden="true"
          />
          <span
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${percent}%` }}
            aria-hidden="true"
          />
        </Hero>
        <div className="mt-[18px] flex items-end">
          <p className="font-mono leading-none" aria-live="polite">
            {frames ? (
              <>
                <span className="text-[34px]">{frames.frame}</span>
                <span className="text-[15px] text-dim"> / {frames.frames} frames</span>
              </>
            ) : (
              <>
                <span className="text-[34px]">{percent}%</span>
                <span className="text-[15px] text-dim">
                  {" "}
                  {exportPhaseLabel(job.phase).toLowerCase()}
                  {total ? ` · ${total} frames` : ""}
                </span>
              </>
            )}
          </p>
          <span className="min-w-0 flex-1" />
          {pace && (
            <div className="text-right font-mono">
              <p className="text-[15px] leading-none">
                ≈{Math.max(1, Math.round(pace.leftSeconds))} s left
              </p>
              <p className="mt-1.5 text-[12px] text-dim">
                {Math.round(pace.fps)} fps · {pace.elapsedSeconds.toFixed(1)} s in
              </p>
            </div>
          )}
        </div>
        <div
          className="relative mt-3.5 h-1 overflow-hidden rounded-[2px] bg-dialog-selected"
          role="progressbar"
          aria-label="Export progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i
            className="absolute inset-y-0 left-0 rounded-[2px] bg-foreground"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-5">
          <Steps steps={exportSteps(job, timing)} />
        </div>
      </div>
      <div className="min-w-0 pb-4">
        <h3 className="mb-1.5 flex h-6 items-center justify-between text-[13px] font-medium">
          Queue
          <span className="font-mono text-[12px] font-normal text-dim">
            {active.length - waiting} running{waiting ? ` · ${waiting} waiting` : ""}
          </span>
        </h3>
        {active.map((item) => {
          const owner = compositions.find((entry) => entry.id === item.compositionId);
          const itemFrames = exportFrames(item);
          const running = item.phase !== "queued";
          return (
            <div
              key={item.id}
              className="-mx-2 flex min-h-[52px] items-center gap-2.5 rounded-[10px] p-2"
            >
              {owner ? (
                <ProjectPoster composition={owner} className="h-[27px] w-12 rounded-[5px]" />
              ) : (
                <span className="h-[27px] w-12 rounded-[5px] bg-dialog-selected" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {owner?.name ?? "Another project"} · {exportFormatLabel(item.format)}
                </p>
                <p className="truncate font-mono text-[12px] leading-[1.3] text-dim">
                  {running
                    ? `${exportPhaseLabel(item.phase).toLowerCase()}${itemFrames ? ` · ${itemFrames.frame} / ${itemFrames.frames}` : ""}`
                    : "waiting its turn"}
                </p>
                {running && (
                  <div className="relative mt-[7px] h-[3px] overflow-hidden rounded-[2px] bg-dialog-selected">
                    <i
                      className="absolute inset-y-0 left-0 bg-foreground"
                      style={{ width: `${exportProgressPercent(item)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-[12px] leading-normal text-pretty text-dim">
          Exports take turns. You and each agent get the next slot in order, so one owner's queue
          never holds up another's.
        </p>
        {files.length > 0 && (
          <>
            <h3 className="mt-[22px] mb-1.5 flex h-6 items-center justify-between text-[13px] font-medium">
              Done
              <span className="font-mono text-[12px] font-normal text-dim">{files.length}</span>
            </h3>
            {files.slice(0, 3).map((file) => (
              <FileRow key={file.fileName} file={file} now={now} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function FileRow({ file, now }: { file: ExportFile; now: number }) {
  const [Outline] = formatIcons[file.format];
  return (
    <div className="-mx-2 flex h-11 items-center gap-2.5 rounded-[10px] px-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-raised text-muted-foreground">
        <Outline className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{file.fileName}</p>
        <p className="truncate font-mono text-[12px] leading-[1.3] text-dim">
          {[
            exportFormatLabel(file.format),
            ...(Number.isFinite(file.bytes) ? [formatBytes(file.bytes)] : []),
            exportAge(file.mtimeMs, now),
          ].join(" · ")}
        </p>
      </div>
    </div>
  );
}

/** The finished file, playing where the frame was. */
function ReadyHero({ job, composition }: { job: ExportJob; composition: Composition }) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);
  const url = job.contentUrl;
  const video = isVideoExportFormat(job.format);
  const audio = isAudioExportFormat(job.format);
  const image = !video && !audio;
  const toggle = () => {
    const element = mediaRef.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };
  const events = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const element = event.currentTarget;
      setTime(element.currentTime);
      setProgress(element.duration ? element.currentTime / element.duration : 0);
    },
  };
  const ratio = composition.width / composition.height;
  return (
    <div className="relative grid h-(--well-h) place-items-center overflow-hidden rounded-xl bg-canvas-preview p-4 [--well-h:clamp(160px,calc(100vh-428px),292px)]">
      <div
        className={cn(
          "relative overflow-hidden outline outline-1 outline-foreground/10 shadow-(--dialog-hero-shadow)",
          composition.background === "transparent" && "chequer",
        )}
        style={{ aspectRatio: ratio, width: `min(100%, calc((var(--well-h) - 32px) * ${ratio}))` }}
      >
        {url && image && (
          <img src={url} alt="" className="absolute inset-0 size-full object-contain" />
        )}
        {url && video && (
          <video
            ref={mediaRef}
            src={url}
            className="absolute inset-0 size-full"
            playsInline
            {...events}
          />
        )}
        {(audio || !url) && (
          <ProjectPoster
            composition={composition}
            className="absolute inset-0 size-full rounded-none outline-0"
          />
        )}
        {url && audio && <audio ref={mediaRef} src={url} {...events} />}
        {url && !image && (
          <>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause export" : "Play export"}
              className="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full bg-[#f5f5f5] text-[#0a0a0a] shadow-[0_4px_16px_rgb(0_0_0/0.5)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-preview"
            >
              {playing ? (
                <PauseIcon className="size-[18px]" />
              ) : (
                <PlayIcon className="size-[18px]" />
              )}
            </button>
            <span className="absolute inset-x-3 bottom-2.5 flex items-center gap-2.5">
              <span className="font-mono text-[12px] text-[#f5f5f5] [text-shadow:0_1px_2px_#000]">
                {clock(time)} / {clock(composition.durationSeconds)}
              </span>
              <span className="relative h-[3px] flex-1 overflow-hidden rounded-[2px] bg-white/25">
                <i
                  className="absolute inset-y-0 left-0 bg-[#f5f5f5]"
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function formatFact(format: ExportFormat, hasSound: boolean): string {
  const label = exportFormatLabel(format);
  if (format === "mp4") return `${label} · ${hasSound ? "H.264 + AAC" : "H.264"}`;
  if (format === "webm") return `${label} · ${hasSound ? "VP9 + Opus" : "VP9"}`;
  if (format === "gif") return "Animated GIF";
  if (format === "webp") return "Animated WebP · lossless";
  if (format === "ogg") return `${label} · Vorbis`;
  if (format === "wav") return `${label} · PCM`;
  return label;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function ReadyView({
  job,
  composition,
  hasSound,
  file,
}: {
  job: ExportJob;
  composition: Composition;
  hasSound: boolean;
  file: ExportFile | null;
}) {
  const [copied, setCopied] = useState(false);
  const fileName =
    file?.fileName ?? job.outputPath?.split(/[\\/]/).pop() ?? `${job.id}.${job.format}`;
  const audio = isAudioExportFormat(job.format);
  const sound =
    audio || (isVideoExportFormat(job.format) && hasSound)
      ? exportSoundLine(job.format, job.quality)
      : null;
  const frames = frameCount(composition.durationSeconds, composition.fps);
  const checks = exportChecks(job.format, hasSound);
  const facts: [string, ReactNode][] = [
    [
      "File",
      <span key="file" className="block truncate font-sans font-medium tracking-[-0.01em]">
        {fileName}
      </span>,
    ],
  ];
  if (file && Number.isFinite(file.bytes)) facts.push(["Size", formatBytes(file.bytes)]);
  facts.push(["Format", formatFact(job.format, hasSound)]);
  if (!audio)
    facts.push([
      "Picture",
      job.format === "png"
        ? `${composition.width} × ${composition.height}`
        : `${composition.width} × ${composition.height} · ${composition.fps} fps`,
    ]);
  if (job.format === "png") {
    facts.push(["Frame", `at ${(job.timeSeconds ?? 0).toFixed(2)} s`]);
  } else {
    facts.push([
      "Length",
      audio
        ? `${composition.durationSeconds.toFixed(1)} s`
        : `${composition.durationSeconds.toFixed(1)} s · ${frames} frames`,
    ]);
  }
  if (sound) facts.push(["Sound", sound]);
  if (checks) {
    facts.push([
      "Checked",
      <span key="checked">
        <CheckCircleIcon className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />
        {checks}
      </span>,
    ]);
  }
  return (
    <>
      <div className="min-w-0 pb-2">
        <ReadyHero job={job} composition={composition} />
      </div>
      <div className="min-w-0 pb-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-[9px] text-[13px]">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="min-w-0 text-right font-mono leading-[1.35] text-pretty break-words">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {job.outputPath && (
          <div className="mt-4 flex items-start gap-2 rounded-[10px] bg-dialog-well py-2.5 pr-1.5 pl-3">
            <FolderOpenIcon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
            <span className="min-w-0 flex-1 font-mono text-[12px] leading-normal break-all text-muted-foreground">
              {job.outputPath}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={copied ? "Path copied" : "Copy path"}
              onClick={() => {
                void navigator.clipboard
                  .writeText(job.outputPath ?? "")
                  .then(() => setCopied(true));
              }}
            >
              <ClipboardDocumentIcon />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** A sentence a person can act on, for each engine error code. */
type FailureReason = { title: string; body: string };

function failureSentence(code: string | undefined, composition: Composition): FailureReason {
  if (code === "verify_failed") {
    return {
      title: "The file did not pass its check",
      body: `Every export is checked before it is kept, and this one from ${composition.name} was not. Nothing was written to Exports.`,
    };
  }
  if (code === "opaque_background_required") {
    return {
      title: "Video needs an opaque background",
      body: `${composition.name} is transparent. Set a background, or export a still that keeps the alpha.`,
    };
  }
  if (code === "odd_dimensions") {
    return {
      title: "Video needs an even width and height",
      body: "Change the composition size, or export a still.",
    };
  }
  if (code === "validate_failed") {
    return {
      title: "The composition did not validate",
      body: "The engine checks the piece before it renders. Fix what it found, then try again.",
    };
  }
  if (code === "export_too_large") {
    return {
      title: "Too many frames for this format",
      body: "Shorten the piece, lower its size or frame rate, or pick GIF or video.",
    };
  }
  return {
    title: "The export stopped before the file was kept",
    body: "Nothing was written to Exports. You can try again, or hand the details to an agent.",
  };
}

function FailedView({
  job,
  timing,
  composition,
}: {
  job: ExportJob;
  timing: ExportTiming | undefined;
  composition: Composition;
}) {
  const [copied, setCopied] = useState(false);
  const reason = failureSentence(job.error?.code, composition);
  const at = timing?.endedAt
    ? new Date(timing.endedAt).toLocaleTimeString([], { hour12: false })
    : null;
  const details = [
    `${job.error?.code ?? "export_failed"} · ${job.error?.message ?? "export failed"}`,
    `job ${job.id}${at ? ` · ${at}` : ""}`,
  ];
  return (
    <>
      <div className="min-w-0 pb-2">
        <Hero composition={composition} dimmed />
        <div className="mt-[22px]">
          <Steps steps={exportSteps(job, timing)} />
        </div>
      </div>
      <div className="min-w-0 pb-4">
        <h3 className="text-[15px] font-medium tracking-[-0.015em]">{reason.title}</h3>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-pretty text-muted-foreground">
          {reason.body}
        </p>
        <div className="mt-3.5 rounded-[10px] bg-dialog-well px-3 py-2.5 font-mono text-[12px] leading-[1.6] break-words text-muted-foreground">
          {details.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button
          type="button"
          className="-mx-2.5 mt-3.5 flex h-12 w-[calc(100%+20px)] items-center gap-3 rounded-[10px] px-2.5 text-left outline-none hover:bg-dialog-selected focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            const text = [
              `Automedia export failed for "${composition.name}" (${composition.id}), ${exportFormatLabel(job.format)}.`,
              ...details,
            ].join("\n");
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-dialog-selected text-muted-foreground">
            <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">
              {copied ? "Copied" : "Copy details for an agent"}
            </span>
            <span className="block text-[12px] text-dim">
              The error, the job, and the composition
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
