import { useEffect, useRef, useState } from "react";
import type { StudioEvent } from "../main/events.ts";
import type { ExportFormat } from "@shared/schemas.ts";
import { CodePanes } from "@/components/code-panes.tsx";
import { MusicEditor } from "@/components/music-editor.tsx";
import { CompositionSettingsDialog } from "@/components/composition-settings-dialog.tsx";
import { EmptyState } from "@/components/empty-state.tsx";
import { ExportDialog } from "@/components/export-dialog.tsx";
import { Inspector } from "@/components/inspector.tsx";
import { PreviewStage } from "@/components/preview-stage.tsx";
import { ProjectSidebar } from "@/components/project-sidebar.tsx";
import { ResizeHandle } from "@/components/resize-handle.tsx";
import { Timeline } from "@/components/timeline.tsx";
import { Titlebar } from "@/components/titlebar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { isTypingTarget } from "@/lib/playback.ts";
import { clipLabel } from "@/lib/timeline-math.ts";
import { eventsUrl } from "@/lib/loopback.ts";
import { upsertExportJob } from "@/lib/export-progress.ts";
import { planStudioEvent } from "@/lib/studio-sync.ts";
import {
  fitLayout,
  LAYOUT_LIMITS,
  paneSize,
  readLayout,
  writeLayout,
  type StudioLayout,
} from "@/lib/layout.ts";
import { isSourceMode, useStudioStore } from "@/stores/studio.ts";

async function cancelExport(): Promise<void> {
  const currentJob = useStudioStore.getState().exportJob;
  if (!currentJob || ["completed", "canceled", "failed"].includes(currentJob.phase)) return;
  const canceled = await window.studio.export.cancel(currentJob.id);
  useStudioStore.setState({ exportJob: canceled });
}

export function StudioPage() {
  const mode = useStudioStore((state) => state.mode);
  const composition = useStudioStore((state) => state.composition);
  const compositionId = useStudioStore((state) => state.compositionId);
  const compositions = useStudioStore((state) => state.compositions);
  const openIds = useStudioStore((state) => state.openIds);
  const media = useStudioStore((state) => state.media);
  const controls = useStudioStore((state) => state.controls);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const selectedMarkerId = useStudioStore((state) => state.selectedMarkerId);
  const exportJob = useStudioStore((state) => state.exportJob);
  const exportJobs = useStudioStore((state) => state.exportJobs);
  const exportFiles = useStudioStore((state) => state.exports);
  const ffmpegHealth = useStudioStore((state) => state.ffmpegHealth);
  const runtimeCatalog = useStudioStore((state) => state.runtimeCatalog);
  const lastExportFormat = useStudioStore((state) => state.lastExportFormat);
  const loading = useStudioStore((state) => state.loading);
  const loadError = useStudioStore((state) => state.loadError);
  const boot = useStudioStore((state) => state.boot);
  const reloadLists = useStudioStore((state) => state.reloadLists);
  const selectComposition = useStudioStore((state) => state.selectComposition);
  const createComposition = useStudioStore((state) => state.createComposition);
  const removeComposition = useStudioStore((state) => state.removeComposition);
  const setMode = useStudioStore((state) => state.setMode);
  const seekTo = useStudioStore((state) => state.seekTo);
  const togglePlay = useStudioStore((state) => state.togglePlay);
  const applyClockTime = useStudioStore((state) => state.applyClockTime);
  const setLoopPlayback = useStudioStore((state) => state.setLoopPlayback);
  const setSelectedTrackId = useStudioStore((state) => state.setSelectedTrackId);
  const setSelectedMarkerId = useStudioStore((state) => state.setSelectedMarkerId);
  const putControl = useStudioStore((state) => state.putControl);
  const dropCached = useStudioStore((state) => state.dropCached);
  const files = useStudioStore((state) => state.files);
  const markCodeSaved = useStudioStore((state) => state.markCodeSaved);
  const markPatternSaved = useStudioStore((state) => state.markPatternSaved);
  const dirtyHtml = useStudioStore((state) => state.dirtyHtml);
  const dirtyCss = useStudioStore((state) => state.dirtyCss);
  const dirtyJs = useStudioStore((state) => state.dirtyJs);
  const dirtyPattern = useStudioStore((state) => state.dirtyPattern);
  const [iframeRevision, setIframeRevision] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [layout, setLayout] = useState<StudioLayout>(readLayout);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [dragging, setDragging] = useState<"sidebar" | "inspector" | "timeline" | null>(null);
  const eventSource = useRef<EventSource | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const fitted = fitLayout(layout, viewport.width, viewport.height);

  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    writeLayout(layout);
  }, [layout]);
  useEffect(() => {
    if (!composition) return;
    const timer = window.setTimeout(() => {
      void useStudioStore.getState().refreshLoopSeam();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [composition, compositionId, iframeRevision, media]);
  useEffect(() => {
    const source = new EventSource(eventsUrl());
    eventSource.current = source;
    const onMessage = (event: MessageEvent<string>) => {
      let parsed: StudioEvent;
      try {
        // SAFETY: the loopback SSE endpoint emits JSON StudioEvent records.
        parsed = JSON.parse(event.data) as StudioEvent;
      } catch {
        return;
      }
      const current = useStudioStore.getState();
      const payload = parsed.payload;
      const trackId = payload && "trackId" in payload ? payload.trackId : null;
      const controlId = payload && "controlId" in payload ? payload.controlId : null;
      const plan = planStudioEvent(parsed, {
        compositionId: current.compositionId,
        pendingTrack: Boolean(trackId && current.hasPendingWrite("track", trackId)),
        pendingControl: Boolean(controlId && current.hasPendingWrite("control", controlId)),
        dirtyHtml,
        dirtyCss,
        dirtyJs,
        dirtyPattern,
      });
      if (plan.bumpThumbnail) current.bumpThumbnail(plan.bumpThumbnail);
      if (plan.markThumbnailError) current.markThumbnailError(plan.markThumbnailError);
      if (plan.exportJob) {
        const nextJob = plan.exportJob;
        useStudioStore.setState((state) => ({
          exportJob: nextJob,
          exportJobs: upsertExportJob(state.exportJobs, nextJob),
        }));
        if (plan.refreshExports) void current.refreshExports();
      }
      if (plan.reloadLists || plan.selectComposition || plan.closeComposition) {
        const selectId = plan.selectComposition;
        const closeId = plan.closeComposition;
        const reload = plan.reloadLists;
        void (async () => {
          if (reload) await useStudioStore.getState().reloadLists();
          if (closeId) {
            await useStudioStore.getState().closeProject(closeId);
            return;
          }
          if (selectId) await useStudioStore.getState().selectComposition(selectId);
        })();
      }
      if (plan.dropCached) {
        current.dropCached(plan.dropCached);
        return;
      }
      if (plan.refreshActivity) void current.refreshActivity();
      if (plan.refreshComposition) void current.refreshComposition();
      if (plan.refreshMedia) void current.refreshMedia();
      if (plan.refreshControls) void current.refreshControls();
      if (plan.refreshFiles) void current.refreshFiles();
      if (plan.reloadCode && current.compositionId) {
        const { path, file } = plan.reloadCode;
        void window.studio.files
          .read(current.compositionId, path)
          .then((result) => markCodeSaved(file, result.content, result.etag));
      }
      if (plan.reloadPattern && current.compositionId) {
        void window.studio.files
          .read(current.compositionId, plan.reloadPattern.path)
          .then((result) => markPatternSaved(result.content, result.etag));
      }
      if (plan.bumpIframe) setIframeRevision((value) => value + 1);
    };
    source.addEventListener("message", onMessage);
    return () => {
      source.close();
      eventSource.current = null;
    };
  }, [dirtyCss, dirtyHtml, dirtyJs, dirtyPattern, dropCached, markCodeSaved, markPatternSaved]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        const current = useStudioStore.getState();
        if (isSourceMode(current.mode)) {
          current.setMode("preview");
          return;
        }
        current.setSelectedTrackId(null);
        current.setSelectedMarkerId(null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace" || event.code === "Delete") {
        const current = useStudioStore.getState();
        if (isSourceMode(current.mode)) return;
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        if (current.selectedTrackId) void current.deleteTrack(current.selectedTrackId);
        else if (current.selectedMarkerId) void current.deleteMarker(current.selectedMarkerId);
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        useStudioStore.getState().togglePlay();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const current = useStudioStore.getState();
        const step = 1 / (current.composition?.fps ?? 30);
        current.seekTo(current.playheadSeconds + (event.key === "ArrowLeft" ? -step : step));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const startExport = async (input: {
    compositionId?: string;
    format: ExportFormat;
    quality?: number;
    timeSeconds?: number;
  }) => {
    const targetId = input.compositionId ?? useStudioStore.getState().compositionId;
    if (!targetId) return;
    try {
      const payload: Parameters<typeof window.studio.export.start>[0] = {
        compositionId: targetId,
        format: input.format,
      };
      if (input.quality !== undefined) payload.quality = input.quality;
      if (input.timeSeconds !== undefined) payload.timeSeconds = input.timeSeconds;
      const job = await window.studio.export.start(payload);
      useStudioStore.setState((state) => ({
        exportJob: job,
        lastExportFormat: input.format,
        exportJobs: upsertExportJob(state.exportJobs, job),
      }));
      setExportMessage(null);
    } catch (error) {
      void useStudioStore.getState().refreshHealth();
      setExportMessage(error instanceof Error ? error.message : "Export failed");
    }
  };
  const confirmTrash = async () => {
    await removeComposition();
    setTrashOpen(false);
  };
  const beginDrag =
    (axis: "sidebar" | "inspector" | "timeline") =>
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const origin = axis === "timeline" ? event.clientY : event.clientX;
      const start = layoutRef.current;
      setDragging(axis);
      const onMove = (move: PointerEvent) => {
        if (axis === "sidebar") {
          const width = start.sidebarWidth + (move.clientX - origin);
          setLayout((current) => ({
            ...current,
            sidebarCollapsed: false,
            sidebarWidth: Math.min(
              LAYOUT_LIMITS.sidebar.max,
              Math.max(LAYOUT_LIMITS.sidebar.min, width),
            ),
          }));
        }
        if (axis === "inspector") {
          const width = start.inspectorWidth - (move.clientX - origin);
          setLayout((current) => ({
            ...current,
            inspectorCollapsed: false,
            inspectorWidth: Math.min(
              LAYOUT_LIMITS.inspector.max,
              Math.max(LAYOUT_LIMITS.inspector.min, width),
            ),
          }));
        }
        if (axis === "timeline") {
          const height = start.timelineHeight - (move.clientY - origin);
          setLayout((current) => ({
            ...current,
            timelineCollapsed: false,
            timelineHeight: Math.min(
              LAYOUT_LIMITS.timeline.max,
              Math.max(LAYOUT_LIMITS.timeline.min, height),
            ),
          }));
        }
      };
      const onUp = () => {
        setDragging(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

  const sidebarWidth = paneSize(
    fitted.sidebarCollapsed,
    fitted.sidebarWidth,
    LAYOUT_LIMITS.sidebar.rail,
  );
  const inspectorWidth = paneSize(
    fitted.inspectorCollapsed,
    fitted.inspectorWidth,
    LAYOUT_LIMITS.inspector.strip,
  );
  const timelineHeight = paneSize(
    fitted.timelineCollapsed,
    fitted.timelineHeight,
    LAYOUT_LIMITS.timeline.strip,
  );
  const selectedTrack = media.tracks.find((track) => track.id === selectedTrackId);
  const openBlockCode = (id?: string) => {
    if (id) setSelectedTrackId(id);
    setMode("code");
  };
  const openMusicEditor = (id?: string) => {
    if (id) setSelectedTrackId(id);
    setMode("music");
  };

  return (
    <TooltipProvider>
      <main
        className="studio-shell flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground"
        data-mode={mode}
        data-canvas="shell"
      >
        <Titlebar
          composition={composition}
          editingName={
            isSourceMode(mode)
              ? selectedTrack
                ? clipLabel(selectedTrack)
                : mode === "music"
                  ? "Music"
                  : "Block"
              : null
          }
          exportJob={exportJob}
          ffmpegHealth={ffmpegHealth}
          onDoneEditing={() => setMode("preview")}
          onExport={() => setExportOpen(true)}
        />
        <div className="studio-body">
          <div
            className="studio-project-rail flex min-h-0 min-w-0 bg-canvas-rail"
            style={{ width: sidebarWidth }}
          >
            <ProjectSidebar
              compositions={compositions}
              compositionId={compositionId}
              openIds={openIds}
              collapsed={fitted.sidebarCollapsed}
              files={files}
              onTrack={useStudioStore.getState().putTrack}
              onToggle={() =>
                setLayout((current) => ({
                  ...current,
                  sidebarCollapsed: !current.sidebarCollapsed,
                }))
              }
              onReorder={(ids) => void useStudioStore.getState().reorderCompositions(ids)}
              onSelect={(id) => void selectComposition(id)}
              onCreate={(example) => void createComposition(example)}
              onImport={() => {
                void useStudioStore
                  .getState()
                  .importProject()
                  .then((result) => {
                    if (result?.catalogMismatch) setCatalogWarning(true);
                  })
                  .catch((error: Error) => {
                    setNotice({ title: "Could not import project", message: error.message });
                  });
              }}
              onExport={(id) => {
                void selectComposition(id).then(() => setExportOpen(true));
              }}
              onExportPng={(id) => {
                const current = useStudioStore.getState();
                void startExport({
                  compositionId: id,
                  format: "png",
                  timeSeconds: id === current.compositionId ? current.playheadSeconds : 0,
                });
              }}
              onDuplicate={(id) => void useStudioStore.getState().duplicateComposition(id)}
              onSaveProject={(id) => {
                void useStudioStore
                  .getState()
                  .saveProject(id)
                  .catch((error: Error) => {
                    setNotice({ title: "Could not save project", message: error.message });
                  });
              }}
              onTrash={(id) => {
                void selectComposition(id).then(() => setTrashOpen(true));
              }}
            />
          </div>
          <ResizeHandle
            orientation="vertical"
            label="Resize project sidebar"
            gutter
            active={dragging === "sidebar"}
            onDragStart={beginDrag("sidebar")}
            onToggle={() =>
              setLayout((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))
            }
          />
          {loading ? (
            <section className="studio-nest flex min-h-0 flex-1 items-center justify-center bg-canvas-preview text-sm text-muted-foreground">
              Loading
            </section>
          ) : loadError ? (
            <section className="studio-nest flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-canvas-preview">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="ghost" onClick={() => void reloadLists()}>
                Retry
              </Button>
            </section>
          ) : !composition ? (
            <div className="studio-nest flex min-h-0 flex-1 flex-col bg-canvas-preview">
              <EmptyState onCreate={() => void createComposition()} />
            </div>
          ) : (
            <>
              <div className="studio-nest flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-preview">
                <PreviewStage
                  key={`${composition.id}-${iframeRevision}-${composition.width}-${composition.height}-${composition.fps}-${composition.durationSeconds}-${composition.background}-${media.tracks.map((track) => `${track.id}:${track.kind}:${track.asset}`).join("|")}`}
                  composition={composition}
                  media={media}
                  controls={controls}
                  onTime={applyClockTime}
                />
                <ResizeHandle
                  orientation="horizontal"
                  label="Resize timeline"
                  active={dragging === "timeline"}
                  onDragStart={beginDrag("timeline")}
                  onToggle={() =>
                    setLayout((current) => ({
                      ...current,
                      timelineCollapsed: !current.timelineCollapsed,
                    }))
                  }
                />
                <div
                  className="flex min-h-0 shrink-0 flex-col bg-canvas-timeline"
                  style={{ height: timelineHeight }}
                >
                  <Timeline
                    composition={composition}
                    media={media}
                    selectedTrackId={selectedTrackId}
                    selectedMarkerId={selectedMarkerId}
                    collapsed={fitted.timelineCollapsed}
                    onExpand={() =>
                      setLayout((current) => ({ ...current, timelineCollapsed: false }))
                    }
                    onSeek={seekTo}
                    onPlayToggle={togglePlay}
                    onLoopToggle={() => setLoopPlayback(!useStudioStore.getState().loopPlayback)}
                    onSelectTrack={setSelectedTrackId}
                    onSelectMarker={setSelectedMarkerId}
                    onTrack={useStudioStore.getState().putTrack}
                    onTracks={useStudioStore.getState().putTracks}
                    onDeleteTrack={useStudioStore.getState().deleteTrack}
                    onMarker={useStudioStore.getState().putMarker}
                    onCreateBlock={(start, lane) =>
                      void useStudioStore.getState().createBlock(undefined, start, lane)
                    }
                    onCreateMusic={(start, lane) =>
                      void useStudioStore.getState().createMusicBlock(undefined, start, lane)
                    }
                    onDropAsset={(asset, start, lane) => {
                      const id = useStudioStore.getState().compositionId;
                      if (!id) return;
                      void useStudioStore.getState().addLibraryAsset(asset, start, lane);
                    }}
                    onEditBlock={(id) => openBlockCode(id)}
                    onEditMusic={(id) => openMusicEditor(id)}
                    onSettings={() => setSettingsOpen(true)}
                  />
                </div>
              </div>
              <>
                <ResizeHandle
                  orientation="vertical"
                  label="Resize inspector"
                  active={dragging === "inspector"}
                  onDragStart={beginDrag("inspector")}
                  onToggle={() =>
                    setLayout((current) => ({
                      ...current,
                      inspectorCollapsed: !current.inspectorCollapsed,
                    }))
                  }
                />
                <div
                  className="studio-inspector-rail flex min-h-0 min-w-0 bg-canvas-inspector"
                  style={{ width: inspectorWidth }}
                >
                  <Inspector
                    composition={composition}
                    media={media}
                    controls={controls}
                    selectedTrackId={selectedTrackId}
                    selectedMarkerId={selectedMarkerId}
                    collapsed={fitted.inspectorCollapsed}
                    onExpand={() =>
                      setLayout((current) => ({ ...current, inspectorCollapsed: false }))
                    }
                    onSettings={() => setSettingsOpen(true)}
                    onTrack={useStudioStore.getState().putTrack}
                    onDeleteTrack={useStudioStore.getState().deleteTrack}
                    onMarker={useStudioStore.getState().putMarker}
                    onDeleteMarker={useStudioStore.getState().deleteMarker}
                    onPreviewControl={useStudioStore.getState().previewControl}
                    onControl={(control) => void putControl(control)}
                    onCreateBlock={() => void useStudioStore.getState().createBlock()}
                    onCreateMusic={() => void useStudioStore.getState().createMusicBlock()}
                    onEditBlock={() => openBlockCode(selectedTrackId ?? undefined)}
                    onEditMusic={() => openMusicEditor(selectedTrackId ?? undefined)}
                    exports={exportFiles}
                    onRevealExport={() => {
                      if (compositionId) void window.studio.export.reveal(compositionId);
                    }}
                  />
                </div>
              </>
            </>
          )}
        </div>
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          job={exportJob}
          jobs={exportJobs}
          oddSize={
            composition !== null && (composition.width % 2 !== 0 || composition.height % 2 !== 0)
          }
          lastFormat={lastExportFormat}
          ffmpegHealth={ffmpegHealth}
          errorMessage={exportMessage}
          onStart={(input) => void startExport(input)}
          onCancel={() => void cancelExport()}
          onReveal={() => {
            if (compositionId) void window.studio.export.reveal(compositionId);
          }}
          onSaveCopy={() => {
            if (compositionId) void window.studio.export.saveCopy(compositionId);
          }}
        />
        <CompositionSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          composition={composition}
          runtime={runtimeCatalog}
          onSave={async (input) => {
            await useStudioStore.getState().updateSettings(input);
            setIframeRevision((value) => value + 1);
          }}
        />
        <Dialog
          open={mode === "code"}
          onOpenChange={(open) => {
            if (!open) setMode("preview");
          }}
        >
          <DialogContent
            showCloseButton
            className="flex h-[min(640px,calc(100vh-6rem))] w-[min(1100px,calc(100vw-3rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none"
          >
            <DialogHeader className="shrink-0 px-4 py-3">
              <DialogTitle>
                {selectedTrack ? `Edit ${clipLabel(selectedTrack)}` : "Edit block"}
              </DialogTitle>
              <DialogDescription>HTML, CSS, and JS for this block.</DialogDescription>
            </DialogHeader>
            <CodePanes onReload={() => setIframeRevision((value) => value + 1)} />
          </DialogContent>
        </Dialog>
        <Dialog
          open={mode === "music"}
          onOpenChange={(open) => {
            if (!open) setMode("preview");
          }}
        >
          <DialogContent
            showCloseButton
            className="flex h-[min(560px,calc(100vh-6rem))] w-[min(760px,calc(100vw-3rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none"
          >
            <DialogHeader className="shrink-0 px-4 py-3">
              <DialogTitle>
                {selectedTrack ? `Edit ${clipLabel(selectedTrack)}` : "Edit music"}
              </DialogTitle>
              <DialogDescription>
                Strudel pattern. Automedia plays it and applies mute and volume.
              </DialogDescription>
            </DialogHeader>
            <MusicEditor onReload={() => setIframeRevision((value) => value + 1)} />
          </DialogContent>
        </Dialog>
        <Dialog
          open={catalogWarning}
          onOpenChange={(open) => {
            if (!open) setCatalogWarning(false);
          }}
        >
          <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Runtime libraries differ</DialogTitle>
              <DialogDescription>
                This project was saved with different runtime libraries. The picture may look
                different.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setCatalogWarning(false)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={notice !== null}
          onOpenChange={(open) => {
            if (!open) setNotice(null);
          }}
        >
          <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{notice?.title ?? "Something went wrong"}</DialogTitle>
              <DialogDescription>{notice?.message ?? ""}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setNotice(null)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Move to trash</DialogTitle>
              <DialogDescription>
                {composition
                  ? `${composition.name} will be moved to trash.`
                  : "This project will be moved to trash."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTrashOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void confirmTrash()}>
                Move to trash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
