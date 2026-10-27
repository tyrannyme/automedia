import { useEffect, useState } from "react";
import {
  ArchiveBoxIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  TrashIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import type { ExportFile, ListedComposition } from "@shared/ipc.ts";
import { PosterBox } from "@/components/home-gallery.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { formatLength } from "@/lib/home.ts";

function exportsLine(files: ExportFile[] | null): string {
  if (files === null || files.length === 0) return "and activity log";
  const names = files.map((file) => file.fileName);
  if (names.length === 1) return `activity log, and its export (${names[0]})`;
  if (names.length <= 3)
    return `activity log, and all ${names.length} exports (${names.join(", ")})`;
  return `activity log, and all ${names.length} exports`;
}

/**
 * Confirms moving a project to the trash, worded from what the engine does:
 * store.remove() renames the folder into the library's compositions/.trash.
 */
export function TrashDialog({
  project,
  onOpenChange,
  onConfirm,
}: {
  /** The project to trash; null closes the dialog. */
  project: ListedComposition | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const id = project?.id ?? null;
  useEffect(() => {
    setFiles(null);
    setBusy(false);
    if (!id) return;
    let live = true;
    void window.studio.export
      .list(id)
      .then((list) => {
        if (live) setFiles(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  const count = files?.length ?? 0;

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[520px] gap-0 sm:max-w-[calc(100%-2rem)]">
        {project && (
          <>
            <DialogTitle className="text-[17px] font-medium tracking-[-0.02em] text-balance">
              Move {project.name} to trash?
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-sm">
              It leaves Home and its tab closes. Nothing is deleted.
            </DialogDescription>
            <div className="mt-[18px] flex items-center gap-3 rounded-xl bg-background p-2">
              <PosterBox item={project} className="h-10 w-[72px] shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{project.name}</div>
                <div className="font-mono text-xs leading-[1.4] text-dim">
                  {project.width}×{project.height} · {formatLength(project.durationSeconds)}
                  {files !== null && ` · ${count} ${count === 1 ? "export" : "exports"}`}
                </div>
              </div>
            </div>
            <ul className="mt-[18px] grid gap-3 text-[13px] leading-[1.45] text-muted-foreground">
              <li className="grid grid-cols-[16px_1fr] gap-3">
                <FolderIcon className="mt-0.5 size-4" />
                <span>
                  <b className="font-medium text-foreground">The whole project folder moves</b>: its
                  code, media {exportsLine(files)}.
                </span>
              </li>
              <li className="grid grid-cols-[16px_1fr] gap-3">
                <ArchiveBoxIcon className="mt-0.5 size-4" />
                <span>
                  <b className="font-medium text-foreground">Into Automedia's own trash</b>, inside
                  your library. Not the system Trash, and nothing empties it.
                  <span className="mt-0.5 block font-mono text-xs text-dim">
                    compositions/.trash/
                  </span>
                </span>
              </li>
              <li className="grid grid-cols-[16px_1fr] gap-3">
                <DocumentDuplicateIcon className="mt-0.5 size-4" />
                <span>
                  Copies you saved elsewhere, with Save copy or Save project, stay where they are.
                </span>
              </li>
              {project.lease && (
                <li className="grid grid-cols-[16px_1fr] gap-3">
                  <UserIcon className="mt-0.5 size-4" />
                  <span>
                    <b className="font-medium text-foreground">
                      {project.lease.holder} is working on it now.
                    </b>{" "}
                    Its claim ends, and its next write fails.
                  </span>
                </li>
              )}
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose
                render={<Button variant="ghost" size="sm" className="px-3 text-[13px]" />}
              >
                Cancel
              </DialogClose>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 px-3 text-[13px] text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onConfirm(project.id).finally(() => setBusy(false));
                }}
              >
                <TrashIcon className="size-4" />
                Move to trash
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
