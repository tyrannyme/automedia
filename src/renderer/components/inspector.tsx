import { Cog6ToothIcon, EllipsisHorizontalIcon, QueueListIcon } from "@heroicons/react/24/outline";
import type { ExportFile } from "@shared/ipc.ts";
import type { Composition, Control, MediaDocument, MediaTrack, Marker } from "@shared/schemas.ts";
import {
  useFeed,
  useLiveLease,
  useNow,
  type FeedJumpHandler,
} from "@/components/agent-presence.tsx";
import { ClipPanel, MarkerPanel } from "@/components/inspector-clip.tsx";
import { ControlsList } from "@/components/inspector-controls.tsx";
import { PanelBody, PanelHead, PanelTitle } from "@/components/inspector-parts.tsx";
import { ActivitySection, ClaimNote, ExportsSection } from "@/components/inspector-project.tsx";
import { MediaSection } from "@/components/library-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { exportIsRunning } from "@/lib/export-progress.ts";
import { useStudioStore } from "@/stores/studio.ts";

type InspectorProps = {
  composition: Composition;
  media: MediaDocument;
  controls: Control[];
  files: string[];
  exports: ExportFile[];
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  onSettings: () => void;
  onClearSelection: () => void;
  onTrack: (track: MediaTrack, persist?: boolean) => Promise<void>;
  onDeleteTrack: (id: string) => Promise<void>;
  onMarker: (marker: Marker) => Promise<void>;
  onDeleteMarker: (id: string) => Promise<void>;
  onPreviewControl: (control: Control) => void;
  onControl: (control: Control) => void;
  onEditBlock: () => void;
  onEditMusic: () => void;
  onRevealExport: () => void;
  onOpenLog: () => void;
  onJump?: FeedJumpHandler;
};

/**
 * The panel. With nothing selected it is the project's dashboard: controls first when the
 * project has them, then activity, media and exports. Select a clip and it becomes the clip.
 */
export function Inspector(props: InspectorProps) {
  const { composition, media, selectedTrackId, selectedMarkerId } = props;
  const selected = media.tracks.find((track) => track.id === selectedTrackId);
  const selectedMarker = media.markers.find((marker) => marker.id === selectedMarkerId);

  return (
    <aside
      className="panel flex h-full min-h-0 w-full min-w-0 flex-col bg-canvas-inspector"
      aria-label="Inspector"
      data-canvas="inspector"
    >
      {selected ? (
        <ClipPanel
          key={selected.id}
          composition={composition}
          media={media}
          track={selected}
          onClose={props.onClearSelection}
          onTrack={props.onTrack}
          onDelete={() => void props.onDeleteTrack(selected.id)}
          onEdit={selected.kind === "music" ? props.onEditMusic : props.onEditBlock}
        />
      ) : selectedMarker ? (
        <MarkerPanel
          key={selectedMarker.id}
          composition={composition}
          marker={selectedMarker}
          onClose={props.onClearSelection}
          onMarker={props.onMarker}
          onDelete={() => void props.onDeleteMarker(selectedMarker.id)}
        />
      ) : (
        <ProjectPanel {...props} />
      )}
    </aside>
  );
}

function ProjectPanel({
  composition,
  controls,
  files,
  exports,
  onSettings,
  onTrack,
  onPreviewControl,
  onControl,
  onRevealExport,
  onOpenLog,
  onJump,
}: InspectorProps) {
  const lease = useLiveLease(composition.id);
  const { items, bursts } = useFeed(lease);
  const now = useNow(true, lease ? 1000 : 10_000);
  const exportJob = useStudioStore((state) => state.exportJob);
  const activeExport =
    exportJob && exportJob.compositionId === composition.id && exportIsRunning(exportJob)
      ? exportJob
      : null;
  const hasControls = controls.length > 0;

  return (
    <>
      <PanelHead
        tools={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Project actions"
                />
              }
            >
              <EllipsisHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem onClick={onSettings}>
                <Cog6ToothIcon />
                Composition settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLog}>
                <QueueListIcon />
                All activity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <PanelTitle>{hasControls ? "Controls" : "Project"}</PanelTitle>
      </PanelHead>
      <PanelBody>
        {hasControls && (
          <ControlsList controls={controls} onPreview={onPreviewControl} onCommit={onControl} />
        )}
        {lease && <ClaimNote lease={lease} />}
        <ActivitySection
          items={items}
          bursts={bursts}
          lease={lease}
          now={now}
          onOpenLog={onOpenLog}
          onJump={onJump}
        />
        <MediaSection composition={composition} files={files} onTrack={onTrack} />
        <ExportsSection
          exports={exports}
          activeExport={activeExport}
          now={now}
          onReveal={onRevealExport}
        />
      </PanelBody>
    </>
  );
}
