import { useEffect, useState } from "react";
import { FolderIcon, PlusIcon, SpeakerWaveIcon } from "@heroicons/react/24/outline";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { addAssetToTimeline } from "@/lib/add-asset.ts";
import { isImageLibraryAsset, isVideoLibraryAsset } from "@/lib/library.ts";
import { friendlyMediaError, LIBRARY_ASSET_MIME } from "@/lib/library-drag.ts";
import { compositionAssetUrl } from "@/lib/loopback.ts";
import { cn } from "@/lib/utils.ts";

function AssetThumb({ compositionId, asset }: { compositionId: string; asset: string }) {
  const src = compositionAssetUrl(compositionId, asset);
  if (isVideoLibraryAsset(asset)) {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        className="size-full object-cover"
        aria-hidden="true"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          video.currentTime = duration > 0 ? Math.min(0.5, duration * 0.15) : 0;
        }}
      />
    );
  }
  if (isImageLibraryAsset(asset)) {
    return <img src={src} alt="" className="size-full object-cover" />;
  }
  return (
    <div className="flex size-full items-center justify-center bg-surface text-muted-foreground">
      <SpeakerWaveIcon className="size-5" />
    </div>
  );
}

type LibraryPanelProps = {
  composition: Composition | null;
  files: string[];
  collapsed: boolean;
  onTrack: (track: MediaTrack) => Promise<void>;
};

export function LibraryPanel({ composition, files, collapsed, onTrack }: LibraryPanelProps) {
  const [assets, setAssets] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  useEffect(() => {
    setAssets(
      files
        .filter((file) => file.startsWith("assets/"))
        .map((file) => file.slice("assets/".length)),
    );
  }, [files]);
  useEffect(() => {
    if (selected && !assets.includes(selected)) setSelected(null);
  }, [assets, selected]);

  if (!composition) return null;

  const addToTimeline = async (asset: string) => {
    setAddError(null);
    try {
      await addAssetToTimeline(composition.id, asset, onTrack);
    } catch (error) {
      setAddError(friendlyMediaError(error));
    }
  };

  const beginAssetDrag = (event: React.DragEvent, asset: string) => {
    event.dataTransfer.setData(LIBRARY_ASSET_MIME, asset);
    event.dataTransfer.effectAllowed = "copy";
  };

  const importAsset = async () => {
    const result = await window.studio.assets.import(composition.id);
    if (result) setAssets((current) => [...new Set([...current, result.asset])]);
  };

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border px-1 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Import"
          onClick={() => void importAsset()}
        >
          <PlusIcon />
        </Button>
        {assets.slice(0, 4).map((file) => (
          <button
            type="button"
            key={file}
            draggable
            className={cn(
              "size-10 cursor-grab overflow-hidden rounded-md bg-surface active:cursor-grabbing",
              selected === file && "ring-2 ring-inset ring-ring",
            )}
            aria-label={file}
            aria-pressed={selected === file}
            onClick={() => setSelected(file)}
            onDragStart={(event) => beginAssetDrag(event, file)}
          >
            <AssetThumb compositionId={composition.id} asset={file} />
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add to timeline"
          disabled={!selected}
          onClick={() => {
            if (selected) void addToTimeline(selected);
          }}
        >
          <PlusIcon />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <FolderIcon className="size-4 text-muted-foreground" />
          Library
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!selected}
            onClick={() => {
              if (selected) void addToTimeline(selected);
            }}
          >
            Add
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Import"
            onClick={() => void importAsset()}
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pt-1.5 pb-3">
          {addError && <p className="pb-2 text-sm text-destructive">{addError}</p>}
          {assets.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">Import media to use it here.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {assets.map((file) => (
                <li key={file}>
                  <button
                    type="button"
                    draggable
                    className={cn(
                      "flex w-full cursor-grab flex-col rounded-md bg-surface text-left hover:bg-muted active:cursor-grabbing",
                      selected === file && "ring-2 ring-inset ring-ring",
                    )}
                    aria-label={file}
                    aria-pressed={selected === file}
                    onClick={() => setSelected(file)}
                    onDragStart={(event) => beginAssetDrag(event, file)}
                  >
                    <span className="aspect-video w-full overflow-hidden rounded-t-md bg-background">
                      <AssetThumb compositionId={composition.id} asset={file} />
                    </span>
                    <span className="truncate px-1.5 py-1 font-mono text-xs text-muted-foreground">
                      {file}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
