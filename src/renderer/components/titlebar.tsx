import { CheckIcon } from "@heroicons/react/24/outline";
import type { ExportJob } from "../../engine/export.ts";
import type { Composition } from "@shared/schemas.ts";
import { Button } from "@/components/ui/button.tsx";
import { AppMark } from "@/components/app-mark.tsx";
import { UpdateButton } from "@/components/update-button.tsx";
import { exportIsRunning } from "@/lib/export-progress.ts";

type TitlebarProps = {
  composition: Composition | null;
  editingName: string | null;
  exportJob: ExportJob | null;
  onDoneEditing: () => void;
  onExport: () => void;
};

export function Titlebar({
  composition,
  editingName,
  exportJob,
  onDoneEditing,
  onExport,
}: TitlebarProps) {
  const running = exportIsRunning(exportJob);

  return (
    <header
      className="titlebar studio-titlebar flex h-11 min-h-11 shrink-0 items-center gap-3 bg-background"
      aria-label="Automedia"
    >
      <span className="flex items-center gap-2">
        <AppMark className="size-[18px] shrink-0" />
        <span className="font-wordmark text-base font-semibold">Automedia</span>
      </span>
      {editingName && (
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          <span className="px-1 text-border" aria-hidden="true">
            /
          </span>
          Editing {editingName}
        </span>
      )}

      <div className="min-w-0 flex-1" />

      <UpdateButton exporting={running} />

      {editingName && (
        <Button
          variant="default"
          size="sm"
          className="px-3"
          data-no-drag=""
          onClick={onDoneEditing}
        >
          <CheckIcon />
          Done
        </Button>
      )}

      <Button
        variant={editingName ? "ghost" : running ? "secondary" : "default"}
        size="sm"
        className="px-3.5"
        data-no-drag=""
        data-export-trigger=""
        disabled={composition === null}
        aria-label={running ? "Export in progress" : "Export"}
        onClick={onExport}
      >
        {running ? "Exporting" : "Export"}
      </Button>
    </header>
  );
}
