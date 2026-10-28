import {
  ArrowUpTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilmIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapPinIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlusIcon,
  ScissorsIcon,
  SpeakerWaveIcon,
  Square2StackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Tip } from "@/components/stage-tip.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { isImageLibraryAsset, isVideoLibraryAsset } from "@/lib/library.ts";
import { clampZoom, formatSnapSeconds, sliderToZoom, zoomToSlider } from "@/lib/timeline-math.ts";
import { cn } from "@/lib/utils.ts";

const itemClass = "gap-2.5 px-2.5 py-2 [&_svg]:text-muted-foreground";
const hintClass = "ml-auto pl-4 font-mono text-[12px] text-dim";

function MediaIcon({ asset }: { asset: string }) {
  if (isVideoLibraryAsset(asset)) return <FilmIcon />;
  if (isImageLibraryAsset(asset)) return <PhotoIcon />;
  return <SpeakerWaveIcon />;
}

function BarIcon({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tip label={label}>
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-[7px] text-muted-foreground disabled:opacity-35"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tip>
  );
}

/** The timeline's own bar: Add, split and delete on the left, zoom on the right. */
export function TimelineBar({
  compact,
  collapsed,
  playheadSeconds,
  hasSelection,
  pixelsPerSecond,
  assets,
  onAddBlock,
  onAddMusic,
  onAddMarker,
  onAddMedia,
  onImportMedia,
  onSplit,
  onDelete,
  onZoom,
  onFit,
  onExpand,
}: {
  compact: boolean;
  collapsed: boolean;
  playheadSeconds: number;
  hasSelection: boolean;
  pixelsPerSecond: number;
  assets: string[];
  onAddBlock: () => void;
  onAddMusic: () => void;
  onAddMarker: () => void;
  onAddMedia: (asset: string) => void;
  onImportMedia: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onZoom: (pixelsPerSecond: number) => void;
  onFit: () => void;
  onExpand: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const at = `at ${formatSnapSeconds(playheadSeconds)}`;
  const Chevron = addOpen ? ChevronUpIcon : ChevronDownIcon;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1",
        compact ? "h-[34px] pr-2 pl-1.5" : "h-10 pr-3 pl-2.5",
      )}
    >
      <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="h-7 gap-1.5 rounded-[7px] px-2 text-[13px] aria-expanded:bg-surface"
            />
          }
        >
          <PlusIcon className="size-3.5" />
          Add
          {!compact && (
            <Chevron className={cn("size-3", addOpen ? "text-foreground" : "text-faint")} />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[260px] min-w-[260px]">
          <DropdownMenuItem className={itemClass} onClick={onAddBlock}>
            <Square2StackIcon />
            Block
            <span className={hintClass}>{at}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onClick={onAddMusic}>
            <MusicalNoteIcon />
            Music
            <span className={hintClass}>{at}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onClick={onAddMarker}>
            <MapPinIcon />
            Marker
            <span className={hintClass}>{at}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={itemClass}>
              <PhotoIcon />
              Media
              <span className="ml-auto pl-4 font-mono text-[12px] text-dim">
                {assets.length} {assets.length === 1 ? "file" : "files"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60 min-w-60">
              {assets.map((asset) => (
                <DropdownMenuItem
                  key={asset}
                  className={itemClass}
                  onClick={() => onAddMedia(asset)}
                >
                  <MediaIcon asset={asset} />
                  <span className="truncate">{asset}</span>
                </DropdownMenuItem>
              ))}
              {assets.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem className={itemClass} onClick={onImportMedia}>
                <ArrowUpTrayIcon />
                Import file…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        className={cn("h-[18px] w-px shrink-0 bg-border", compact ? "mx-1" : "mx-1.5")}
        aria-hidden="true"
      />
      <BarIcon label="Split at playhead" disabled={!hasSelection} onClick={onSplit}>
        <ScissorsIcon className="size-4" />
      </BarIcon>
      <BarIcon label="Delete clip" disabled={!hasSelection} onClick={onDelete}>
        <TrashIcon className="size-4" />
      </BarIcon>
      <div className="flex-1" />
      {collapsed ? (
        <Button
          variant="ghost"
          size="xs"
          className="h-7 rounded-[7px] px-2 text-[13px] text-muted-foreground"
          onClick={onExpand}
        >
          Show timeline
        </Button>
      ) : (
        <>
          <BarIcon
            label="Zoom out"
            disabled={clampZoom(pixelsPerSecond * 0.8) === pixelsPerSecond}
            onClick={() => onZoom(pixelsPerSecond * 0.8)}
          >
            <MagnifyingGlassMinusIcon className="size-4" />
          </BarIcon>
          {!compact && (
            <Slider
              aria-label="Timeline zoom"
              className="mx-1 w-[72px]! [&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:shadow-[0_1px_3px_rgb(0_0_0/0.5)] [&_[data-slot=slider-track]]:h-1! [&_[data-slot=slider-track]]:bg-surface"
              min={0}
              max={1000}
              value={Math.round(zoomToSlider(pixelsPerSecond) * 1000)}
              onValueChange={(value) => {
                const [position = 0] = [value].flat();
                onZoom(sliderToZoom(position / 1000));
              }}
            />
          )}
          <BarIcon
            label="Zoom in"
            disabled={clampZoom(pixelsPerSecond * 1.25) === pixelsPerSecond}
            onClick={() => onZoom(pixelsPerSecond * 1.25)}
          >
            <MagnifyingGlassPlusIcon className="size-4" />
          </BarIcon>
          <Tip label="Fit the timeline">
            <Button
              variant="ghost"
              size="xs"
              className="h-7 rounded-[7px] px-2 text-[13px] text-muted-foreground"
              aria-label="Fit"
              onClick={onFit}
            >
              Fit
            </Button>
          </Tip>
        </>
      )}
    </div>
  );
}
