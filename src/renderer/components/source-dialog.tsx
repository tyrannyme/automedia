import { useCallback, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { CodePanes, type SaveStatus } from "@/components/code-panes.tsx";
import { MusicEditor } from "@/components/music-editor.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { clipLabel } from "@/lib/timeline-math.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore, type WorkspaceMode } from "@/stores/studio.ts";

/**
 * Code mode and music mode: one focused dialog over the studio, named for the
 * clip it edits. Saving is automatic; Done closes.
 */
export function SourceDialog({
  mode,
  onClose,
  onReload,
}: {
  mode: WorkspaceMode;
  onClose: () => void;
  onReload: () => void;
}) {
  const track = useStudioStore((state) =>
    state.media.tracks.find((item) => item.id === state.selectedTrackId),
  );
  const [status, setStatus] = useState<SaveStatus>({
    saving: false,
    conflict: null,
    savedOnce: false,
  });
  const onStatus = useCallback((next: SaveStatus) => setStatus(next), []);
  const music = mode === "music";
  const open = mode === "code" || music;
  const name = track ? clipLabel(track) : music ? "Music" : "Block";
  const statusText = status.conflict
    ? `Not saved · ${status.conflict} changed on disk`
    : status.saving
      ? "Saving"
      : status.savedOnce
        ? music
          ? "Saved · pattern reloaded"
          : "Saved · preview updated"
        : "Saved";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-source-dialog={mode}
        className={cn(
          "flex max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
          music
            ? "h-[min(720px,calc(100vh-4rem))] w-[min(760px,calc(100vw-3rem))]"
            : "h-[calc(100vh-4.5rem)] w-[min(1232px,calc(100vw-3rem))]",
        )}
      >
        <header className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border pr-3 pl-5">
          <span
            className="size-2.5 shrink-0 rounded-[3px] bg-muted-foreground"
            style={track?.color ? { background: track.color } : undefined}
            aria-hidden="true"
          />
          <DialogTitle className="min-w-0 truncate text-[16px] tracking-[-0.015em]">
            {name}
          </DialogTitle>
          <DialogDescription className="shrink-0 text-[13px] text-muted-foreground">
            {music ? "Music" : "Block · 3 files"}
          </DialogDescription>
          <span className="min-w-0 flex-1" />
          <p
            className={cn(
              "flex min-w-0 items-center gap-2 truncate font-mono text-[12px] text-dim",
              status.conflict && "text-foreground",
            )}
            aria-live="polite"
            data-save-status={status.conflict ? "conflict" : status.saving ? "saving" : "saved"}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full bg-dim",
                status.saving && "animate-pulse",
                status.conflict && "bg-foreground",
              )}
              aria-hidden="true"
            />
            <span className="truncate">{statusText}</span>
          </p>
          <DialogClose render={<Button size="sm" className="ml-2 px-3" />}>Done</DialogClose>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              />
            }
          >
            <XMarkIcon />
          </DialogClose>
        </header>
        {mode === "code" && <CodePanes onReload={onReload} onStatus={onStatus} />}
        {music && <MusicEditor onReload={onReload} onStatus={onStatus} />}
      </DialogContent>
    </Dialog>
  );
}
