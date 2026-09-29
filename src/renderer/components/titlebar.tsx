import { CheckIcon } from "@heroicons/react/24/outline";
import type { ExportJob } from "../../main/export.ts";
import type { Composition } from "@shared/schemas.ts";
import appIconUrl from "../../../assets/icon.png";
import { Button } from "@/components/ui/button.tsx";
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
      <img
        src={appIconUrl}
        alt=""
        aria-hidden="true"
        className="size-6 shrink-0 rounded-lg object-cover"
      />
      <span className="font-wordmark text-base font-semibold">Automedia</span>
      {editingName && (
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          Editing {editingName}
        </span>
      )}

      <div className="min-w-0 flex-1" />

      {editingName && (
        <Button variant="default" data-no-drag="" onClick={onDoneEditing}>
          <CheckIcon />
          Done
        </Button>
      )}

      <Button
        variant={editingName ? "ghost" : running ? "secondary" : "default"}
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
