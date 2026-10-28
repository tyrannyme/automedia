import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, PlusIcon, SpeakerWaveIcon } from "@heroicons/react/24/outline";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import { PanelSection } from "@/components/inspector-parts.tsx";
import { Button } from "@/components/ui/button.tsx";
import { addAssetToTimeline } from "@/lib/add-asset.ts";
import {
  formatMediaLength,
  isImageLibraryAsset,
  isVideoLibraryAsset,
  libraryAssetKind,
  libraryAssets,
} from "@/lib/library.ts";
import { friendlyMediaError, LIBRARY_ASSET_MIME } from "@/lib/library-drag.ts";
import { compositionAssetUrl } from "@/lib/loopback.ts";

/** Reads a media file's length from its metadata, for the tile's DM Mono chip. */
function useMediaLength(src: string, kind: "video" | "image" | "audio"): number | null {
  const [length, setLength] = useState<number | null>(null);
  useEffect(() => {
    setLength(null);
    if (kind === "image") return;
    const element = document.createElement(kind === "video" ? "video" : "audio");
    element.preload = "metadata";
    element.muted = true;
    const done = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) setLength(element.duration);
    };
    element.addEventListener("loadedmetadata", done);
    element.src = src;
    return () => {
      element.removeEventListener("loadedmetadata", done);
      element.removeAttribute("src");
      element.load();
    };
  }, [kind, src]);
  return length;
}

function MediaTile({
  compositionId,
  asset,
  onAdd,
}: {
  compositionId: string;
  asset: string;
  onAdd: (asset: string) => void;
}) {
  const kind = libraryAssetKind(asset);
  const length = useMediaLength(compositionAssetUrl(compositionId, asset), kind);
  return (
    <li className="min-w-0">
      <button
        type="button"
        draggable
        className="group/tile block w-full cursor-grab rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={`${asset}. Drag onto the timeline, or double-click to add at the playhead`}
        title={asset}
        onDoubleClick={() => onAdd(asset)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onAdd(asset);
        }}
        onDragStart={(event) => beginAssetDrag(event, asset)}
      >
        <span className="relative block aspect-video w-full overflow-hidden rounded-lg bg-raised outline -outline-offset-1 outline-foreground/10 transition-opacity group-active/tile:opacity-50">
          <AssetThumb compositionId={compositionId} asset={asset} />
          {length !== null && (
            <span className="absolute right-[5px] bottom-[5px] rounded-[5px] bg-black/60 px-[5px] py-0.5 font-mono text-[11px] leading-[1.2] tracking-normal text-[#f5f5f5]">
              {formatMediaLength(length)}
            </span>
          )}
        </span>
        <span className="mt-1.5 block truncate text-[12px] text-muted-foreground group-hover/tile:text-foreground">
          {asset}
        </span>
      </button>
    </li>
  );
}

/**
 * The project's media bin in the panel: its own pictures and sounds, dragged onto the
 * timeline or double-clicked in at the playhead. Empty, it is one quiet line.
 */
export function MediaSection({
  composition,
  files,
  onTrack,
}: {
  composition: Composition;
  files: string[];
  onTrack: (track: MediaTrack) => Promise<void>;
}) {
  const [imported, setImported] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  useEffect(() => setImported([]), [composition.id]);
  const assets = [...new Set([...libraryAssets(files), ...imported])];

  const importAsset = async () => {
    const result = await window.studio.assets.import(composition.id);
    if (result) setImported((current) => [...current, result.asset]);
  };
  const add = async (asset: string) => {
    setAddError(null);
    try {
      await addAssetToTimeline(composition.id, asset, onTrack);
    } catch (error) {
      setAddError(friendlyMediaError(error));
    }
  };

  return (
    <PanelSection
      title="Media"
      action={
        assets.length > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            className="-mr-2 text-[13px] font-normal text-muted-foreground"
            onClick={() => void importAsset()}
          >
            <PlusIcon />
            Import
          </Button>
        ) : (
          <span className="font-mono text-[12px] font-normal tracking-normal text-dim">0</span>
        )
      }
    >
      {assets.length === 0 ? (
        <p className="flex gap-3 text-[13px] leading-[1.45] text-dim">
          <ArrowDownTrayIcon className="mt-px size-4 w-[22px] shrink-0" />
          <span>
            No media yet.{" "}
            <button
              type="button"
              className="rounded-sm text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void importAsset()}
            >
              Import
            </button>{" "}
            audio, video, or images to use them here.
          </span>
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2.5">
            {assets.map((asset) => (
              <MediaTile key={asset} compositionId={composition.id} asset={asset} onAdd={add} />
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-[1.5] text-dim">
            Drag onto the timeline, or double-click to add at the playhead.
          </p>
        </>
      )}
      {addError && <p className="mt-2 text-[13px] text-destructive">{addError}</p>}
    </PanelSection>
  );
}

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
    <div className="flex size-full items-center justify-center bg-raised text-muted-foreground">
      <SpeakerWaveIcon className="size-5" />
    </div>
  );
}

function beginAssetDrag(event: React.DragEvent, asset: string) {
  event.dataTransfer.setData(LIBRARY_ASSET_MIME, asset);
  event.dataTransfer.effectAllowed = "copy";
}
