import { useEffect, useRef, useState } from "react";
import type { StudioEvent } from "../engine/events.ts";
import type { ExportFormat } from "@shared/schemas.ts";
import { SourceDialog } from "@/components/source-dialog.tsx";
import { CompositionSettingsDialog } from "@/components/composition-settings-dialog.tsx";
import { FirstRun } from "@/components/empty-state.tsx";
import { ExportDialog } from "@/components/export-dialog.tsx";
import { ActivityDialog } from "@/components/activity-dialog.tsx";
import { CommandPalette } from "@/components/command-palette.tsx";
import {
  AgentChangeChip,
  AgentPresence,
  type FeedJumpHandler,
} from "@/components/agent-presence.tsx";
import { Inspector } from "@/components/inspector.tsx";
import { PreviewStage } from "@/components/preview-stage.tsx";
import { HomeGallery } from "@/components/home-gallery.tsx";
import { NewProjectSheet } from "@/components/new-project-sheet.tsx";
import { ResizeHandle } from "@/components/resize-handle.tsx";
import { Timeline } from "@/components/timeline.tsx";
import { Titlebar } from "@/components/titlebar.tsx";
import { TrashDialog } from "@/components/trash-dialog.tsx";
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
import { eventsUrl } from "@/lib/loopback.ts";
import { newestExportJob, upsertExportJob } from "@/lib/export-progress.ts";
import { planStudioEvent } from "@/lib/studio-sync.ts";
import {
  fitLayout,
  LAYOUT_LIMITS,
  readLayout,
  SHELL,
  writeLayout,
  type StudioLayout,
} from "@/lib/layout.ts";
import { isSourceMode, useStudioStore } from "@/stores/studio.ts";

function openProject(id: string): void {
  void useStudioStore.getState().openProject(id);
}

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
  const runtimeCatalog = useStudioStore((state) => state.runtimeCatalog);
  const lastExportFormat = useStudioStore((state) => state.lastExportFormat);
  const loading = useStudioStore((state) => state.loading);
  const loadError = useStudioStore((state) => state.loadError);
  const boot = useStudioStore((state) => state.boot);
  const reloadLists = useStudioStore((state) => state.reloadLists);
  const selectComposition = useStudioStore((state) => state.selectComposition);
  const createComposition = useStudioStore((state) => state.createComposition);
  const homeOpen = useStudioStore((state) => state.homeOpen);
  const panelSheetOpen = useStudioStore((state) => state.panelSheetOpen);
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
  const [trashId, setTrashId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [layout, setLayout] = useState<StudioLayout>(readLayout);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const [dragging, setDragging] = useState<"panel" | "timeline" | null>(null);
  const eventSource = useRef<EventSource | null>(null);
  const activityTimer = useRef<number | undefined>(undefined);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const fitted = fitLayout(layout, viewport.width, viewport.height);
  const compact = fitted.compact;

  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    const update = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      useStudioStore.getState().setCompactLayout(window.innerWidth < SHELL.compactBelow);
    };
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
      // Clip, control and marker writes are logged too; refresh the feed once they settle.
      if (
        !plan.refreshActivity &&
        parsed.compositionId === current.compositionId &&
        ["put_track", "put_control", "put_marker"].includes(parsed.type)
      ) {
        window.clearTimeout(activityTimer.current);
        activityTimer.current = window.setTimeout(() => {
          void useStudioStore.getState().refreshActivity();
        }, 400);
      }
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
      if (event.ctrlKey && event.key === "Tab") {
        // Ctrl+Tab walks Home and every open tab in order, as the titlebar shows them.
        event.preventDefault();
        const current = useStudioStore.getState();
        const order = [null, ...current.openIds];
        const at = order.indexOf(current.homeOpen ? null : current.compositionId);
        const next = order[(at + (event.shiftKey ? -1 : 1) + order.length) % order.length];
        if (next) void current.openProject(next);
        else current.showHome();
        return;
      }
      if (isTypingTarget(event.target)) return;
      // Home covers the project; its keys must not play or edit what is hidden.
      if (useStudioStore.getState().homeOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        const current = useStudioStore.getState();
        if (current.panelSheetOpen) {
          current.setPanelSheetOpen(false);
          return;
        }
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
      const started = await window.studio.export.start(payload);
      useStudioStore.setState((state) => {
        const job = newestExportJob(state.exportJobs, started);
        return {
          exportJob: job,
          lastExportFormat: input.format,
          exportJobs: upsertExportJob(state.exportJobs, job),
        };
      });
      setExportMessage(null);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed");
    }
  };
  const confirmTrash = async (id: string) => {
    try {
      await useStudioStore.getState().trashComposition(id);
      setTrashId(null);
    } catch (error) {
      setTrashId(null);
      setNotice({
        title: "Could not move to trash",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const importProject = () => {
    void useStudioStore
      .getState()
      .importProject()
      .then((result) => {
        if (!result) return;
        useStudioStore.setState({ homeOpen: false });
        if (result.catalogMismatch) setCatalogWarning(true);
      })
      .catch((error: Error) => {
        setNotice({ title: "Could not import project", message: error.message });
      });
  };
  const createProject = (example?: Parameters<typeof createComposition>[0]) => {
    void createComposition(example).then(() => useStudioStore.setState({ homeOpen: false }));
  };
  const beginDrag =
    (axis: "panel" | "timeline") => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const origin = axis === "timeline" ? event.clientY : event.clientX;
      const start = layoutRef.current;
      setDragging(axis);
      const onMove = (move: PointerEvent) => {
        if (axis === "panel") {
          const width = start.panelWidth - (move.clientX - origin);
          setLayout((current) => ({
            ...current,
            panelWidth: Math.min(LAYOUT_LIMITS.panel.max, Math.max(LAYOUT_LIMITS.panel.min, width)),
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

  const timelineHeight = fitted.timelineCollapsed
    ? LAYOUT_LIMITS.timeline.strip
    : fitted.timelineHeight;
  const showHome = homeOpen || (!loading && !composition && !loadError);
  const trashProject = compositions.find((item) => item.id === trashId) ?? null;
  const openBlockCode = (id?: string) => {
    if (id) setSelectedTrackId(id);
    setMode("code");
  };
  const openMusicEditor = (id?: string) => {
    if (id) setSelectedTrackId(id);
    setMode("music");
  };
  const revealExports = () => {
    if (compositionId) void window.studio.export.reveal(compositionId);
  };
  const jumpToActivity: FeedJumpHandler = (jump) => {
    if (jump.kind === "export") {
      revealExports();
      return;
    }
    const track = useStudioStore.getState().media.tracks.find((item) => item.id === jump.trackId);
    if (!track) return;
    if (jump.kind === "track") setSelectedTrackId(track.id);
    else if (track.kind === "music") openMusicEditor(track.id);
    else openBlockCode(track.id);
  };
  const panel = composition ? (
    <Inspector
      composition={composition}
      media={media}
      controls={controls}
      files={files}
      exports={exportFiles}
      selectedTrackId={selectedTrackId}
      selectedMarkerId={selectedMarkerId}
      onSettings={() => setSettingsOpen(true)}
      onClearSelection={() => {
        setSelectedTrackId(null);
        setSelectedMarkerId(null);
      }}
      onTrack={useStudioStore.getState().putTrack}
      onDeleteTrack={useStudioStore.getState().deleteTrack}
      onMarker={useStudioStore.getState().putMarker}
      onDeleteMarker={useStudioStore.getState().deleteMarker}
      onPreviewControl={useStudioStore.getState().previewControl}
      onControl={(control) => void putControl(control)}
      onEditBlock={() => openBlockCode(selectedTrackId ?? undefined)}
      onEditMusic={() => openMusicEditor(selectedTrackId ?? undefined)}
      onRevealExport={revealExports}
      onOpenLog={() => setActivityOpen(true)}
      onJump={jumpToActivity}
    />
  ) : null;

  return (
    <TooltipProvider>
      <main
        className="studio-shell flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground"
        data-mode={mode}
        data-canvas="shell"
      >
        <Titlebar
          compositions={compositions}
          openIds={openIds}
          activeId={compositionId}
          homeActive={showHome}
          compact={compact}
          canExport={!showHome && composition !== null}
          exportJob={exportJob}
          onHome={() => useStudioStore.getState().showHome()}
          onSelect={openProject}
          onClose={(id) => void useStudioStore.getState().closeProject(id)}
          onCloseOthers={(keepId) => {
            const current = useStudioStore.getState();
            for (const id of current.openIds) {
              if (id !== keepId) void current.closeProject(id);
            }
          }}
          onNew={() => setNewOpen(true)}
          onExport={() => setExportOpen(true)}
          presence={
            showHome ? null : (
              <AgentPresence onOpenLog={() => setActivityOpen(true)} onJump={jumpToActivity} />
            )
          }
        />
        <div className="studio-body" data-compact={compact ? "true" : "false"}>
          {showHome ? (
            !loading && compositions.length === 0 ? (
              <FirstRun
                onCreate={createProject}
                onImport={importProject}
                onAllTemplates={() => setNewOpen(true)}
              />
            ) : (
              <HomeGallery
                compositions={compositions}
                openIds={openIds}
                onNew={() => setNewOpen(true)}
                onImport={importProject}
                onReorder={(ids) => void useStudioStore.getState().reorderCompositions(ids)}
                onOpen={openProject}
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
                onTrash={setTrashId}
              />
            )
          ) : loading || !composition ? (
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
          ) : (
            <>
              <div
                className="studio-nest studio-stage relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-preview"
                data-panel-sheet={compact && panelSheetOpen ? "open" : "closed"}
              >
                <AgentChangeChip onJump={jumpToActivity} />
                <PreviewStage
                  key={`${composition.id}-${iframeRevision}-${composition.width}-${composition.height}-${composition.fps}-${composition.durationSeconds}-${composition.background}-${media.tracks.map((track) => `${track.id}:${track.kind}:${track.asset}`).join("|")}`}
                  composition={composition}
                  media={media}
                  controls={controls}
                  onTime={applyClockTime}
                  onSettings={() => setSettingsOpen(true)}
                  onOpenCode={(id) => openBlockCode(id)}
                  onReload={() => setIframeRevision((value) => value + 1)}
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
                  style={{ maxHeight: timelineHeight }}
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
                {compact && panelSheetOpen && (
                  <div
                    className="studio-panel-sheet flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-border bg-popover shadow-float motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-150"
                    role="dialog"
                    aria-label="Project panel"
                    style={{
                      bottom: `calc(var(--stage-timeline-height, ${timelineHeight}px) + var(--stage-player-height))`,
                    }}
                  >
                    {panel}
                  </div>
                )}
              </div>
              {!compact && (
                <>
                  <ResizeHandle
                    orientation="vertical"
                    label="Resize panel"
                    active={dragging === "panel"}
                    onDragStart={beginDrag("panel")}
                    onToggle={() => setLayout((current) => ({ ...current, panelWidth: 320 }))}
                  />
                  <div
                    className="studio-inspector-rail flex min-h-0 min-w-0 bg-canvas-inspector"
                    style={{ width: fitted.panelWidth }}
                  >
                    {panel}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <ActivityDialog
          open={activityOpen}
          onOpenChange={setActivityOpen}
          onJump={jumpToActivity}
        />
        <CommandPalette
          onExport={() => setExportOpen(true)}
          onExportFrame={() => {
            const timeSeconds = useStudioStore.getState().playheadSeconds;
            void startExport({ format: "png", timeSeconds });
          }}
          onSettings={() => setSettingsOpen(true)}
          onActivity={() => setActivityOpen(true)}
        />
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          job={exportJob}
          jobs={exportJobs}
          lastFormat={lastExportFormat}
          errorMessage={exportMessage}
          onStart={startExport}
          onCancel={() => void cancelExport()}
          onReveal={() => {
            if (compositionId) void window.studio.export.reveal(compositionId);
          }}
          onSaveCopy={() => {
            if (compositionId) void window.studio.export.saveCopy(compositionId);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
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
        <SourceDialog
          mode={mode}
          onClose={() => setMode("preview")}
          onReload={() => setIframeRevision((value) => value + 1)}
        />
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
        <TrashDialog
          project={trashProject}
          onOpenChange={(open) => {
            if (!open) setTrashId(null);
          }}
          onConfirm={confirmTrash}
        />
        <NewProjectSheet
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreate={createProject}
          onImport={importProject}
        />
      </main>
    </TooltipProvider>
  );
}
