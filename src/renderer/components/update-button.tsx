import { useEffect, useMemo, useState } from "react";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import type { UpdateState } from "@shared/ipc.ts";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { releaseChanges } from "@/lib/release-notes.ts";
import { cn } from "@/lib/utils.ts";

function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: "none" });
  useEffect(() => {
    const unsubscribe = window.studio.updates.subscribe(setState);
    void window.studio.updates.get().then(setState);
    return unsubscribe;
  }, []);
  return state;
}

/** The button's rounded square, traced as a progress ring. */
function ProgressRing({ progress }: { progress: number }) {
  const ring = { x: 1, y: 1, width: 34, height: 34, rx: 15, pathLength: 100, strokeWidth: 2 };
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true" className="absolute inset-0 size-9">
      <rect {...ring} className="stroke-surface" />
      <rect
        {...ring}
        strokeDasharray={`${progress} 100`}
        className="stroke-foreground transition-[stroke-dasharray] duration-200 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

type UpdateButtonProps = {
  /** Installing restarts the app, so it waits while an export runs. */
  exporting: boolean;
};

/** Titlebar icon for a found update: download, then restart to install. */
export function UpdateButton({ exporting }: UpdateButtonProps) {
  const state = useUpdateState();
  const notes = state.status === "none" ? "" : state.notes;
  const changes = useMemo(() => releaseChanges(notes), [notes]);
  if (state.status === "none") return null;

  const downloading = state.status === "downloading";
  const ready = state.status === "ready";
  const waiting = ready && exporting;
  const title = ready
    ? `Restart to update to ${state.version}`
    : downloading
      ? `Downloading ${state.version} · ${Math.floor(state.progress)}%`
      : `Download update ${state.version}`;

  const onClick = () => {
    if (state.status === "available") {
      // Failures come back through the update state.
      void window.studio.updates.download().catch(() => {});
    } else if (ready && !exporting) {
      void window.studio.updates.install();
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <Button
            variant="ghost"
            size="icon"
            data-no-drag=""
            aria-label={title}
            aria-disabled={downloading || waiting}
            className={cn(
              "relative",
              (downloading || waiting) && "cursor-default",
              downloading && "hover:bg-transparent",
            )}
            onClick={onClick}
          />
        }
      >
        {downloading && <ProgressRing progress={state.progress} />}
        {ready ? (
          <ArrowPathIcon className={cn("size-5", waiting && "opacity-50")} />
        ) : (
          <ArrowDownTrayIcon className={cn("size-5", downloading && "text-muted-foreground")} />
        )}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        className="max-w-sm flex-col items-start gap-1.5 px-3 py-2 data-closed:animate-none data-open:animate-none data-[state=delayed-open]:animate-none"
      >
        <span className="font-medium">{title}</span>
        {state.error && <span className="opacity-70">Download failed. Click to retry.</span>}
        {waiting && <span className="opacity-70">Waiting for the export to finish.</span>}
        {changes.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 pl-4 opacity-70">
            {changes.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
