import { CheckIcon } from "@heroicons/react/24/outline";
import type { ExportJob } from "../../main/export.ts";
import type { FfmpegHealth } from "@shared/ffmpeg.ts";
import type { Composition } from "@shared/schemas.ts";
import appIconUrl from "../../../assets/icon.png";
import { Button } from "@/components/ui/button.tsx";
import { exportIsRunning } from "@/lib/export-progress.ts";

type TitlebarProps = {
  composition: Composition | null;
  editingName: string | null;
  exportJob: ExportJob | null;
  ffmpegHealth?: FfmpegHealth | null;
  onDoneEditing: () => void;
  onExport: () => void;
};

export function Titlebar({
  composition,
  editingName,
  exportJob,
  ffmpegHealth = null,
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

      {ffmpegHealth && (!ffmpegHealth.ffmpeg || !ffmpegHealth.ffprobe) && (
        <span
          className="max-w-[14rem] truncate text-sm text-destructive"
          title={ffmpegHint(ffmpegHealth)}
        >
          ffmpeg missing
        </span>
      )}

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

function ffmpegHint(health: FfmpegHealth): string {
  if (!health.ffmpeg && !health.ffprobe) {
    return "ffmpeg and ffprobe are not on PATH. Video, audio export, and media import need them.";
  }
  if (!health.ffmpeg) return "ffmpeg is not on PATH. Video and audio export need it.";
  return "ffprobe is not on PATH. Media import needs it.";
}
