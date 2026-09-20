import { useEffect, useState } from "react";
import type { ExportJob } from "../../main/export.ts";
import type { FfmpegHealth } from "@shared/ffmpeg.ts";
import { exportNeedsQuality, isVideoExportFormat } from "@shared/media.ts";
import type { ExportFormat } from "@shared/schemas.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  exportFormatDisabled,
  exportFormatGroups,
  exportFormatHelper,
  exportFormatLabel,
} from "@/lib/export-format.ts";
import {
  exportDialogView,
  exportIsRunning,
  exportPhaseLabel,
  exportProgressPercent,
} from "@/lib/export-progress.ts";
import { useStudioStore } from "@/stores/studio.ts";

type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: ExportJob | null;
  jobs?: ExportJob[];
  oddSize: boolean;
  lastFormat: ExportFormat;
  ffmpegHealth?: FfmpegHealth | null;
  errorMessage: string | null;
  onStart: (input: { format: ExportFormat; quality?: number; timeSeconds?: number }) => void;
  onCancel: () => void;
  onReveal: () => void;
  onSaveCopy: () => void;
  followJobId?: string | null;
};

export function ExportDialog({
  open,
  onOpenChange,
  job,
  jobs = [],
  oddSize,
  lastFormat,
  ffmpegHealth = null,
  errorMessage,
  onStart,
  onCancel,
  onReveal,
  onSaveCopy,
  followJobId = null,
}: ExportDialogProps) {
  const playheadSeconds = useStudioStore((state) => (open ? state.playheadSeconds : 0));
  const [format, setFormat] = useState<ExportFormat>(lastFormat);
  const [quality, setQuality] = useState(80);
  const [followId, setFollowId] = useState<string | null>(null);
  const ffmpegReady = !ffmpegHealth || (ffmpegHealth.ffmpeg && ffmpegHealth.ffprobe);
  const view = exportDialogView(job, followId);
  const waiting = jobs.filter((item) => exportIsRunning(item) && item.id !== job?.id).length;

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
    let next = lastFormat;
    if (oddSize && isVideoExportFormat(next)) next = "png";
    if (!ffmpegReady && next !== "png") next = "png";
    setFormat(next);
  }, [ffmpegReady, lastFormat, oddSize, open, view]);

  const needsQuality = exportNeedsQuality(format);
  const videoBlocked = oddSize && isVideoExportFormat(format);
  const encoderBlocked = format !== "png" && !ffmpegReady;
  const progress = exportProgressPercent(job);
  const helper = exportFormatHelper(format);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-export-dialog=""
        data-export-view={view}
        data-export-format={format}
      >
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>{descriptionFor(view)}</DialogDescription>
        </DialogHeader>
        <div
          key={view}
          className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 motion-reduce:animate-none"
        >
          {view === "setup" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Format</Label>
                {exportFormatGroups.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{group.label}</p>
                    <ToggleGroup
                      value={group.formats.some((item) => item === format) ? [format] : []}
                      onValueChange={(value) => {
                        const next = group.formats.find((item) => item === value[0]);
                        if (next) setFormat(next);
                      }}
                      variant="default"
                      spacing={1}
                      className="flex w-full"
                      aria-label={`${group.label} export format`}
                    >
                      {group.formats.map((item) => (
                        <ToggleGroupItem
                          key={item}
                          value={item}
                          className="min-w-0 flex-1"
                          disabled={exportFormatDisabled(item, { oddSize, ffmpegReady })}
                        >
                          {exportFormatLabel(item)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                ))}
                {oddSize && (
                  <p className="text-sm text-muted-foreground">
                    MP4 and WebM need even width and height. Use a still, an audio format, or change
                    the composition size.
                  </p>
                )}
                {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
              </div>
              {needsQuality && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="export-quality">Quality</Label>
                    <span className="font-mono text-sm text-muted-foreground">{quality}</span>
                  </div>
                  <Slider
                    id="export-quality"
                    value={[quality]}
                    min={1}
                    max={100}
                    step={1}
                    onValueChange={(value) =>
                      setQuality(Array.isArray(value) ? Number(value[0]) : quality)
                    }
                    aria-label="Export quality"
                  />
                </div>
              )}
              {format === "png" && (
                <p className="font-mono text-sm text-muted-foreground">
                  Still from {playheadSeconds.toFixed(2)}s
                </p>
              )}
              {ffmpegHealth && !ffmpegReady && (
                <Alert variant="destructive">
                  <AlertTitle>ffmpeg is not available</AlertTitle>
                  <AlertDescription>
                    Install ffmpeg and ffprobe, then restart Automedia. PNG stills still work.
                  </AlertDescription>
                </Alert>
              )}
              {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
            </div>
          )}

          {view === "running" && job && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm">{exportPhaseLabel(job.phase)}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {exportFormatLabel(job.format)}
                </p>
              </div>
              <Progress value={progress} className="gap-0" aria-label="Export progress" />
              {waiting > 0 && (
                <p className="text-sm text-muted-foreground">
                  {waiting === 1 ? "1 export waiting" : `${waiting} exports waiting`}
                </p>
              )}
            </div>
          )}

          {view === "ready" && job && (
            <div className="space-y-2">
              <p className="text-sm">Ready</p>
              {job.outputPath && (
                <p className="truncate font-mono text-xs text-muted-foreground">{job.outputPath}</p>
              )}
            </div>
          )}

          {view === "failed" && (
            <p className="text-sm text-destructive">{job?.error?.message ?? "Export failed"}</p>
          )}
        </div>
        <DialogFooter>
          {view === "setup" && (
            <Button
              onClick={() => {
                if (needsQuality) {
                  onStart({ format, quality });
                  return;
                }
                if (format === "png") {
                  onStart({ format, timeSeconds: playheadSeconds });
                  return;
                }
                onStart({ format });
              }}
              disabled={videoBlocked || encoderBlocked}
            >
              Start export
            </Button>
          )}
          {view === "running" && (
            <Button variant="destructive" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {view === "ready" && (
            <>
              <Button variant="ghost" onClick={onReveal}>
                Reveal
              </Button>
              <Button variant="ghost" onClick={onSaveCopy}>
                Save copy
              </Button>
              <Button onClick={() => setFollowId(null)}>Export again</Button>
            </>
          )}
          {view === "failed" && <Button onClick={() => setFollowId(null)}>Try again</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function descriptionFor(view: ReturnType<typeof exportDialogView>): string {
  if (view === "running") return "You can close this and keep working.";
  if (view === "ready") return "The file is in this project's exports folder.";
  if (view === "failed") return "Nothing was written. You can try again.";
  return "Choose a format, then render. You can keep working.";
}
