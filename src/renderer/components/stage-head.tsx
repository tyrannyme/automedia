import {
  ArrowPathIcon,
  BackwardIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  ForwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import {
  PauseIcon,
  PlayIcon,
  ViewColumnsIcon as ViewColumnsSolidIcon,
} from "@heroicons/react/24/solid";
import { frameCount, frameFromTime, timeFromFrame } from "@shared/clock.ts";
import type { Composition } from "@shared/schemas.ts";
import { Tip } from "@/components/stage-tip.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { frameTimecode } from "@/lib/playback.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

const ZOOMS = [0.5, 1, 2] as const;

function Dot() {
  return <i className="text-faint not-italic">·</i>;
}

/** Name, the facts of the picture in DM Mono, and the stage's own tools. */
export function StageHead({
  composition,
  durationSeconds,
  compact,
  onSettings,
}: {
  composition: Composition;
  durationSeconds: number;
  compact: boolean;
  onSettings?: (() => void) | undefined;
}) {
  const zoom = useStudioStore((state) => state.stageZoom);
  const setZoom = useStudioStore((state) => state.setStageZoom);
  const panelOpen = useStudioStore((state) => state.panelSheetOpen);
  const togglePanel = useStudioStore((state) => state.togglePanelSheet);
  const PanelIcon = panelOpen ? ViewColumnsSolidIcon : ViewColumnsIcon;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        compact ? "h-11 gap-2 pr-1.5 pl-4" : "h-12 gap-2.5 pr-2.5 pl-5",
      )}
    >
      <h2 className="min-w-0 truncate text-sm font-medium">{composition.name}</h2>
      <span
        className="flex shrink-0 gap-2.5 font-mono text-[13px] leading-none text-dim"
        title={`${composition.fps} fps`}
      >
        <span>
          {composition.width} × {composition.height}
        </span>
        {!compact && (
          <>
            <Dot />
            <span>{composition.fps} fps</span>
          </>
        )}
        <Dot />
        <span>{durationSeconds.toFixed(1)} s</span>
      </span>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="h-7 gap-1 rounded-[7px] px-2 text-[13px] text-muted-foreground"
                aria-label="Picture zoom"
              />
            }
          >
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
            <ChevronDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32 min-w-32">
            <DropdownMenuRadioGroup
              value={String(zoom)}
              onValueChange={(value) => setZoom(value === "fit" ? "fit" : Number(value))}
            >
              <DropdownMenuRadioItem value="fit">Fit</DropdownMenuRadioItem>
              {ZOOMS.map((value) => (
                <DropdownMenuRadioItem key={value} value={String(value)}>
                  <span className="font-mono">{value * 100}%</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tip label="Composition settings" side="bottom">
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-[7px] text-muted-foreground"
            aria-label="Composition settings"
            onClick={onSettings}
          >
            <Cog6ToothIcon className="size-4" />
          </Button>
        </Tip>
        {compact && (
          <>
            <span className="mx-0.5 h-[18px] w-px bg-border" aria-hidden="true" />
            <Tip label={panelOpen ? "Hide panel" : "Show panel"} side="bottom">
              <Button
                variant="ghost"
                size="icon-xs"
                className={cn(
                  "rounded-[7px] text-muted-foreground",
                  panelOpen && "bg-surface text-foreground",
                )}
                aria-label={panelOpen ? "Hide panel" : "Show panel"}
                aria-pressed={panelOpen}
                onClick={togglePanel}
              >
                <PanelIcon className="size-4" />
              </Button>
            </Tip>
          </>
        )}
      </div>
    </div>
  );
}

function TransportButton({
  label,
  compact,
  onClick,
  children,
}: {
  label: string;
  compact: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tip label={label}>
      <Button
        variant="ghost"
        size={compact ? "icon-sm" : "icon"}
        className="text-muted-foreground"
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tip>
  );
}

/**
 * The player under the picture: the clock on the left, the transport in the
 * middle, loop and sound on the right. Editing tools live on the timeline.
 */
export function StagePlayer({
  composition,
  durationSeconds,
  compact,
}: {
  composition: Composition;
  durationSeconds: number;
  compact: boolean;
}) {
  const playheadSeconds = useStudioStore((state) => state.playheadSeconds);
  const playing = useStudioStore((state) => state.playing);
  const loopPlayback = useStudioStore((state) => state.loopPlayback);
  const previewMuted = useStudioStore((state) => state.previewMuted);
  const seekTo = useStudioStore((state) => state.seekTo);
  const togglePlay = useStudioStore((state) => state.togglePlay);
  const setLoopPlayback = useStudioStore((state) => state.setLoopPlayback);
  const setPreviewMuted = useStudioStore((state) => state.setPreviewMuted);
  const fps = composition.fps;
  const frame = frameFromTime(playheadSeconds, fps, durationSeconds);
  const stepFrame = (direction: -1 | 1) => {
    const last = frameCount(durationSeconds, fps) - 1;
    seekTo(timeFromFrame(Math.min(last, Math.max(0, frame + direction)), fps));
  };
  const PlayGlyph = playing ? PauseIcon : PlayIcon;
  const SoundIcon = previewMuted ? SpeakerXMarkIcon : SpeakerWaveIcon;
  return (
    <div
      aria-label="Transport"
      className={cn(
        "grid shrink-0 grid-cols-[1fr_auto_1fr] items-center",
        compact ? "h-12 pr-2 pl-4" : "h-14 pr-4 pl-5",
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2 font-mono leading-none whitespace-nowrap tabular-nums">
        <span className={cn("text-foreground", compact ? "text-[15px]" : "text-base")}>
          {frameTimecode(frame, fps)}
        </span>
        <span className="text-[13px] text-dim">
          / {frameTimecode(frameCount(durationSeconds, fps), fps)}
        </span>
        <span className="ml-1.5 text-[13px] text-dim" title="Frame number">
          f{frame}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <TransportButton label="Go to start" compact={compact} onClick={() => seekTo(0)}>
          <BackwardIcon className="size-4" />
        </TransportButton>
        <TransportButton label="Previous frame" compact={compact} onClick={() => stepFrame(-1)}>
          <ChevronLeftIcon className="size-4" />
        </TransportButton>
        <Tip label={playing ? "Pause" : "Play"}>
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            className={cn(
              "mx-1.5 grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-[scale] duration-100 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
              compact ? "size-9" : "size-10",
            )}
            onClick={togglePlay}
          >
            <PlayGlyph className={cn("size-[18px]", !playing && "translate-x-px")} />
          </button>
        </Tip>
        <TransportButton label="Next frame" compact={compact} onClick={() => stepFrame(1)}>
          <ChevronRightIcon className="size-4" />
        </TransportButton>
        <TransportButton
          label="Go to end"
          compact={compact}
          onClick={() => seekTo(durationSeconds)}
        >
          <ForwardIcon className="size-4" />
        </TransportButton>
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <Tip label={loopPlayback ? "Disable loop" : "Enable loop"}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground",
              loopPlayback && "bg-surface text-foreground hover:bg-surface",
            )}
            aria-label={loopPlayback ? "Disable loop" : "Enable loop"}
            aria-pressed={loopPlayback}
            onClick={() => setLoopPlayback(!loopPlayback)}
          >
            <ArrowPathIcon className="size-4" />
          </Button>
        </Tip>
        <Tip label={previewMuted ? "Unmute preview" : "Mute preview"}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground", previewMuted && "text-foreground")}
            aria-label={previewMuted ? "Unmute preview" : "Mute preview"}
            aria-pressed={previewMuted}
            onClick={() => setPreviewMuted(!previewMuted)}
          >
            <SoundIcon className="size-4" />
          </Button>
        </Tip>
      </div>
    </div>
  );
}
