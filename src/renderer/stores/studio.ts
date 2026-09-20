import { create } from "zustand";
import type { ActivityEntry } from "../../main/activity.ts";
import type { ExportJob } from "../../main/export.ts";
import type { RuntimeCatalog } from "../../main/runtime.ts";
import type { ValidationReport } from "../../main/validate.ts";
import type { ExportFile } from "@shared/ipc.ts";
import type { FfmpegHealth } from "@shared/ffmpeg.ts";
import { addAssetToTimeline } from "@/lib/add-asset.ts";
import type { Composition, Control, MediaDocument, MediaTrack, Marker } from "@shared/schemas.ts";
import type { ExampleId } from "../../main/examples/index.ts";
import { upsertById } from "@shared/collections.ts";
import { contentDuration } from "@shared/duration.ts";
import { firstBlockDirectory, blockDirectory, blockPaths } from "@/lib/block-paths.ts";
import { firstMusicAsset, musicPatternPath } from "@shared/music-paths.ts";
import { readOpenIds, writeOpenIds } from "@/lib/layout.ts";
import { applyPreviewTime, playFrom } from "@/lib/playback.ts";

export type WorkspaceMode = "preview" | "code" | "music";
export type CodeFile = "html" | "css" | "js";

type SavedCode = { html: string; css: string; js: string };

export function isSourceMode(mode: WorkspaceMode): boolean {
  return mode === "code" || mode === "music";
}

type WorkspaceSnapshot = {
  composition: Composition;
  media: MediaDocument;
  controls: Control[];
  html: string;
  css: string;
  js: string;
  htmlEtag: string;
  cssEtag: string;
  jsEtag: string;
  dirtyHtml: boolean;
  dirtyCss: boolean;
  dirtyJs: boolean;
  savedCode: SavedCode;
  pattern: string;
  patternEtag: string;
  dirtyPattern: boolean;
  savedPattern: string;
  playheadSeconds: number;
  playing: boolean;
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  validation: ValidationReport | null;
  activity: ActivityEntry[];
  files: string[];
  exports: ExportFile[];
  mode: WorkspaceMode;
};

type StudioState = {
  mode: WorkspaceMode;
  compositionId: string | null;
  compositions: Composition[];
  openIds: string[];
  composition: Composition | null;
  media: MediaDocument;
  controls: Control[];
  html: string;
  css: string;
  js: string;
  htmlEtag: string;
  cssEtag: string;
  jsEtag: string;
  dirtyHtml: boolean;
  dirtyCss: boolean;
  dirtyJs: boolean;
  pattern: string;
  patternEtag: string;
  dirtyPattern: boolean;
  savedPattern: string;
  playheadSeconds: number;
  playing: boolean;
  loopPlayback: boolean;
  seekNonce: number;
  selectedTrackId: string | null;
  selectedMarkerId: string | null;
  validation: ValidationReport | null;
  exportJob: ExportJob | null;
  activity: ActivityEntry[];
  loadError: string | null;
  runtimeCatalog: RuntimeCatalog | null;
  exports: ExportFile[];
  files: string[];
  loading: boolean;
  lastExportFormat: ExportFile["format"];
  savedCode: SavedCode;
  cache: Record<string, WorkspaceSnapshot>;
  thumbnailRevisions: Record<string, number>;
  thumbnailFailures: Record<string, boolean>;
  pendingWrites: Record<string, number>;
  writeEpoch: number;
  loopSeam: boolean | null;
  loopSeamEpoch: number;
  ffmpegHealth: FfmpegHealth | null;
  exportJobs: ExportJob[];
  setMode: (mode: WorkspaceMode) => void;
  setPlayhead: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  applyClockTime: (seconds: number) => void;
  setLoopPlayback: (loop: boolean) => void;
  setSelectedTrackId: (id: string | null) => void;
  setSelectedMarkerId: (id: string | null) => void;
  setCode: (file: CodeFile, value: string) => void;
  markCodeSaved: (file: CodeFile, value: string, etag: string) => void;
  setPattern: (value: string) => void;
  markPatternSaved: (value: string, etag: string) => void;
  setExportFormat: (format: ExportFile["format"]) => void;
  boot: () => Promise<void>;
  reloadLists: () => Promise<void>;
  selectComposition: (id: string) => Promise<void>;
  closeProject: (id: string) => Promise<void>;
  createComposition: (example?: ExampleId) => Promise<void>;
  duplicateComposition: (id: string) => Promise<void>;
  saveProject: (id: string) => Promise<{ path: string } | null>;
  importProject: () => Promise<{ catalogMismatch: boolean } | null>;
  removeComposition: () => Promise<void>;
  refreshComposition: () => Promise<void>;
  refreshMedia: () => Promise<void>;
  refreshControls: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshFiles: () => Promise<string[]>;
  refreshExports: () => Promise<void>;
  dropCached: (id: string) => void;
  bumpThumbnail: (compositionId: string) => void;
  markThumbnailError: (compositionId: string) => void;
  updateSettings: (
    input: Partial<Omit<Composition, "id" | "version" | "entry" | "createdAt" | "updatedAt">>,
  ) => Promise<void>;
  putTrack: (track: MediaTrack, persist?: boolean) => Promise<void>;
  putTracks: (tracks: MediaTrack[], persist?: boolean) => Promise<void>;
  createBlock: (name?: string, start?: number, lane?: number) => Promise<void>;
  createMusicBlock: (name?: string, start?: number, lane?: number) => Promise<void>;
  addLibraryAsset: (asset: string, start?: number, lane?: number) => Promise<void>;
  reorderCompositions: (ids: string[]) => Promise<void>;
  refreshHealth: () => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
  putMarker: (marker: Marker) => Promise<void>;
  deleteMarker: (markerId: string) => Promise<void>;
  previewControl: (control: Control) => void;
  putControl: (control: Control) => Promise<void>;
  hasPendingWrite: (kind: "track" | "control", id: string) => boolean;
  runValidation: () => Promise<void>;
  refreshLoopSeam: () => Promise<void>;
  syncDerivedDuration: () => Promise<void>;
};

const emptyMedia: MediaDocument = { tracks: [], markers: [] };
const emptySavedCode: SavedCode = { html: "", css: "", js: "" };

async function fittedComposition(
  current: Composition | null,
  id: string,
  tracks: readonly { start: number; duration: number }[],
): Promise<Composition | null> {
  if (!current) return current;
  const next = contentDuration(tracks);
  if (Math.abs(next - current.durationSeconds) < 1e-6) return current;
  return window.studio.compositions.get(id);
}

function writeKey(kind: "track" | "control", id: string): string {
  return `${kind}:${id}`;
}

function errorMessage(error: Error): string {
  return error.message;
}

function rememberOpen(ids: string[]): string[] {
  const unique = [...new Set(ids)];
  writeOpenIds(unique);
  return unique;
}

function snapshotActive(state: StudioState): WorkspaceSnapshot | null {
  if (!state.compositionId || !state.composition) return null;
  return {
    composition: state.composition,
    media: state.media,
    controls: state.controls,
    html: state.html,
    css: state.css,
    js: state.js,
    htmlEtag: state.htmlEtag,
    cssEtag: state.cssEtag,
    jsEtag: state.jsEtag,
    dirtyHtml: state.dirtyHtml,
    dirtyCss: state.dirtyCss,
    dirtyJs: state.dirtyJs,
    savedCode: state.savedCode,
    pattern: state.pattern,
    patternEtag: state.patternEtag,
    dirtyPattern: state.dirtyPattern,
    savedPattern: state.savedPattern,
    playheadSeconds: state.playheadSeconds,
    playing: false,
    selectedTrackId: state.selectedTrackId,
    selectedMarkerId: state.selectedMarkerId,
    validation: state.validation,
    activity: state.activity,
    files: state.files,
    exports: state.exports,
    mode: state.mode,
  };
}

function applySnapshot(snapshot: WorkspaceSnapshot, id: string): Partial<StudioState> {
  return {
    compositionId: id,
    composition: snapshot.composition,
    media: snapshot.media,
    controls: snapshot.controls,
    html: snapshot.html,
    css: snapshot.css,
    js: snapshot.js,
    htmlEtag: snapshot.htmlEtag,
    cssEtag: snapshot.cssEtag,
    jsEtag: snapshot.jsEtag,
    dirtyHtml: snapshot.dirtyHtml,
    dirtyCss: snapshot.dirtyCss,
    dirtyJs: snapshot.dirtyJs,
    savedCode: snapshot.savedCode,
    pattern: snapshot.pattern,
    patternEtag: snapshot.patternEtag,
    dirtyPattern: snapshot.dirtyPattern,
    savedPattern: snapshot.savedPattern,
    playheadSeconds: snapshot.playheadSeconds,
    playing: false,
    selectedTrackId: snapshot.selectedTrackId,
    selectedMarkerId: snapshot.selectedMarkerId,
    validation: snapshot.validation,
    activity: snapshot.activity,
    files: snapshot.files,
    exports: snapshot.exports,
    mode: snapshot.mode,
    loopSeam: null,
    loading: false,
    loadError: null,
  };
}

export function blockDir(media: MediaDocument, selectedTrackId: string | null): string | null {
  return firstBlockDirectory(media.tracks, selectedTrackId);
}

export function musicAsset(media: MediaDocument, selectedTrackId: string | null): string | null {
  return firstMusicAsset(media.tracks, selectedTrackId);
}

async function waitForPendingWrites(getState: () => StudioState, id: string): Promise<void> {
  if (getState().compositionId !== id) return;
  const deadline = Date.now() + 5000;
  while (Object.keys(getState().pendingWrites).length > 0 && Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  }
}

async function flushDirtySources(
  getState: () => StudioState,
  setState: (partial: Partial<StudioState>) => void,
  id: string,
): Promise<void> {
  await waitForPendingWrites(getState, id);
  const current = getState();
  if (current.compositionId === id) {
    await flushWorkspaceDirty(
      id,
      current,
      (file, content, etag) => {
        getState().markCodeSaved(file, content, etag);
      },
      (content, etag) => {
        getState().markPatternSaved(content, etag);
      },
    );
    return;
  }
  const snapshot = current.cache[id];
  if (!snapshot) return;
  const next = { ...snapshot };
  await flushWorkspaceDirty(
    id,
    snapshot,
    (file, content, etag) => {
      const key = file;
      next[key] = content;
      if (file === "html") {
        next.htmlEtag = etag;
        next.dirtyHtml = false;
      }
      if (file === "css") {
        next.cssEtag = etag;
        next.dirtyCss = false;
      }
      if (file === "js") {
        next.jsEtag = etag;
        next.dirtyJs = false;
      }
      next.savedCode = { ...next.savedCode, [file]: content };
    },
    (content, etag) => {
      next.pattern = content;
      next.patternEtag = etag;
      next.dirtyPattern = false;
      next.savedPattern = content;
    },
  );
  setState({ cache: { ...getState().cache, [id]: next } });
}

async function flushWorkspaceDirty(
  id: string,
  workspace: Pick<
    WorkspaceSnapshot,
    | "media"
    | "selectedTrackId"
    | "html"
    | "css"
    | "js"
    | "htmlEtag"
    | "cssEtag"
    | "jsEtag"
    | "dirtyHtml"
    | "dirtyCss"
    | "dirtyJs"
    | "pattern"
    | "patternEtag"
    | "dirtyPattern"
  >,
  onCode: (file: CodeFile, content: string, etag: string) => void,
  onPattern: (content: string, etag: string) => void,
): Promise<void> {
  const dir = blockDir(workspace.media, workspace.selectedTrackId);
  if (dir) {
    const paths = blockPaths(dir);
    const files: { file: CodeFile; dirty: boolean; value: string; etag: string; path: string }[] = [
      {
        file: "html",
        dirty: workspace.dirtyHtml,
        value: workspace.html,
        etag: workspace.htmlEtag,
        path: paths.html,
      },
      {
        file: "css",
        dirty: workspace.dirtyCss,
        value: workspace.css,
        etag: workspace.cssEtag,
        path: paths.css,
      },
      {
        file: "js",
        dirty: workspace.dirtyJs,
        value: workspace.js,
        etag: workspace.jsEtag,
        path: paths.js,
      },
    ];
    for (const item of files) {
      if (!item.dirty) continue;
      const result = await window.studio.files.write({
        compositionId: id,
        path: item.path,
        encoding: "utf8",
        content: item.value,
        expectedEtag: item.etag,
      });
      onCode(item.file, result.content, result.etag);
    }
  }
  const asset = musicAsset(workspace.media, workspace.selectedTrackId);
  if (asset && workspace.dirtyPattern) {
    const result = await window.studio.files.write({
      compositionId: id,
      path: musicPatternPath(asset),
      encoding: "utf8",
      content: workspace.pattern,
      expectedEtag: workspace.patternEtag,
    });
    onPattern(result.content, result.etag);
  }
}

async function readBlockCode(
  id: string,
  dir: string | null,
): Promise<
  Pick<WorkspaceSnapshot, "html" | "css" | "js" | "htmlEtag" | "cssEtag" | "jsEtag" | "savedCode">
> {
  if (!dir) {
    return {
      html: "",
      css: "",
      js: "",
      htmlEtag: "",
      cssEtag: "",
      jsEtag: "",
      savedCode: emptySavedCode,
    };
  }
  const paths = blockPaths(dir);
  const [html, css, js] = await Promise.all([
    window.studio.files.read(id, paths.html),
    window.studio.files.read(id, paths.css),
    window.studio.files.read(id, paths.js),
  ]);
  return {
    html: html.content,
    css: css.content,
    js: js.content,
    htmlEtag: html.etag,
    cssEtag: css.etag,
    jsEtag: js.etag,
    savedCode: { html: html.content, css: css.content, js: js.content },
  };
}

async function readMusicPattern(
  id: string,
  asset: string | null,
): Promise<Pick<WorkspaceSnapshot, "pattern" | "patternEtag" | "savedPattern">> {
  if (!asset) {
    return { pattern: "", patternEtag: "", savedPattern: "" };
  }
  const file = await window.studio.files.read(id, musicPatternPath(asset));
  return { pattern: file.content, patternEtag: file.etag, savedPattern: file.content };
}

async function loadWorkspace(id: string): Promise<WorkspaceSnapshot> {
  const [composition, media, controlsDoc, activity, _files, exports] = await Promise.all([
    window.studio.compositions.get(id),
    window.studio.media.get(id),
    window.studio.controls.get(id),
    window.studio.activity.list(id),
    window.studio.files.list(id),
    window.studio.export.list(id),
  ]);
  const firstBlock = media.tracks.find((track) => track.kind === "block");
  const [code, pattern] = await Promise.all([
    readBlockCode(id, blockDir(media, firstBlock?.id ?? null)),
    readMusicPattern(id, firstMusicAsset(media.tracks, null)),
  ]);
  return {
    composition,
    media,
    controls: controlsDoc.controls,
    activity,
    exports,
    files: _files,
    ...code,
    ...pattern,
    dirtyHtml: false,
    dirtyCss: false,
    dirtyJs: false,
    dirtyPattern: false,
    selectedTrackId: null,
    selectedMarkerId: null,
    playheadSeconds: 0,
    playing: false,
    validation: null,
    mode: "preview",
  };
}

export const useStudioStore = create<StudioState>((set, get) => ({
  mode: "preview",
  compositionId: null,
  compositions: [],
  openIds: [],
  composition: null,
  media: emptyMedia,
  controls: [],
  html: "",
  css: "",
  js: "",
  htmlEtag: "",
  cssEtag: "",
  jsEtag: "",
  dirtyHtml: false,
  dirtyCss: false,
  dirtyJs: false,
  pattern: "",
  patternEtag: "",
  dirtyPattern: false,
  savedPattern: "",
  playheadSeconds: 0,
  playing: false,
  loopPlayback: false,
  seekNonce: 0,
  selectedTrackId: null,
  selectedMarkerId: null,
  validation: null,
  exportJob: null,
  activity: [],
  loadError: null,
  runtimeCatalog: null,
  exports: [],
  files: [],
  loading: true,
  lastExportFormat: "mp4",
  savedCode: emptySavedCode,
  cache: {},
  thumbnailRevisions: {},
  thumbnailFailures: {},
  pendingWrites: {},
  writeEpoch: 0,
  loopSeam: null,
  loopSeamEpoch: 0,
  ffmpegHealth: null,
  exportJobs: [],
  setMode: (mode) => set({ mode }),
  setPlayhead: (seconds) => {
    const duration = get().composition?.durationSeconds ?? Number.POSITIVE_INFINITY;
    set({ playheadSeconds: Math.max(0, Math.min(duration, seconds)) });
  },
  seekTo: (seconds) => {
    const duration = get().composition?.durationSeconds ?? Number.POSITIVE_INFINITY;
    set({
      playheadSeconds: Math.max(0, Math.min(duration, seconds)),
      seekNonce: get().seekNonce + 1,
    });
  },
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => {
    const current = get();
    const duration = current.composition?.durationSeconds ?? 0;
    if (current.playing) {
      set({ playing: false });
      return;
    }
    const next = playFrom(current.playheadSeconds, duration);
    set({
      playheadSeconds: next.playheadSeconds,
      playing: true,
      seekNonce:
        next.playheadSeconds === current.playheadSeconds
          ? current.seekNonce
          : current.seekNonce + 1,
    });
  },
  applyClockTime: (seconds) => {
    const current = get();
    const duration = current.composition?.durationSeconds ?? Number.POSITIVE_INFINITY;
    const next = applyPreviewTime(current.playing, seconds, duration, current.loopPlayback);
    if (!next) return;
    set({
      playheadSeconds: next.playheadSeconds,
      playing: next.playing,
      seekNonce: next.wrapped ? current.seekNonce + 1 : current.seekNonce,
    });
  },
  setLoopPlayback: (loopPlayback) => set({ loopPlayback }),
  setSelectedTrackId: (selectedTrackId) => {
    const previous = get();
    const previousDir = blockDir(previous.media, previous.selectedTrackId);
    const previousMusic = musicAsset(previous.media, previous.selectedTrackId);
    set({
      selectedTrackId,
      selectedMarkerId: selectedTrackId ? null : previous.selectedMarkerId,
    });
    const current = get();
    const id = current.compositionId;
    const selected = current.media.tracks.find((track) => track.id === selectedTrackId);
    if (current.mode === "code" && selected?.kind !== "block") {
      set({ mode: selected?.kind === "music" ? "music" : "preview" });
    }
    if (current.mode === "music" && selected?.kind !== "music") {
      set({ mode: selected?.kind === "block" ? "code" : "preview" });
    }
    if (!id) return;
    const dir = blockDir(current.media, selectedTrackId);
    if (dir && dir !== previousDir) {
      void readBlockCode(id, dir).then((code) =>
        set({ ...code, dirtyHtml: false, dirtyCss: false, dirtyJs: false }),
      );
    }
    const nextMusic = musicAsset(current.media, selectedTrackId);
    if (nextMusic && nextMusic !== previousMusic) {
      void readMusicPattern(id, nextMusic).then((pattern) =>
        set({ ...pattern, dirtyPattern: false }),
      );
    }
  },
  setSelectedMarkerId: (selectedMarkerId) =>
    set({ selectedMarkerId, selectedTrackId: selectedMarkerId ? null : get().selectedTrackId }),
  setCode: (file, value) => {
    const saved = get().savedCode[file];
    const key = file === "html" ? "html" : file === "css" ? "css" : "js";
    // SAFETY: the three code keys and their dirty flags are paired by CodeFile.
    set({
      [key]: value,
      [`dirty${file[0].toUpperCase()}${file.slice(1)}`]: value !== saved,
    } as Partial<StudioState>);
  },
  markCodeSaved: (file, value, etag) => {
    const key = file === "html" ? "html" : file === "css" ? "css" : "js";
    // SAFETY: CodeFile maps one-to-one to the three persisted etag fields.
    const etagKey = `${key}Etag` as "htmlEtag" | "cssEtag" | "jsEtag";
    // SAFETY: CodeFile maps one-to-one to the three persisted dirty fields.
    const dirtyKey = `dirty${file[0].toUpperCase()}${file.slice(1)}` as
      | "dirtyHtml"
      | "dirtyCss"
      | "dirtyJs";
    // SAFETY: key, etagKey, and dirtyKey are derived from the same CodeFile union.
    set({
      [key]: value,
      [etagKey]: etag,
      [dirtyKey]: false,
      savedCode: { ...get().savedCode, [key]: value },
    } as Partial<StudioState>);
  },
  setPattern: (value) => {
    set({ pattern: value, dirtyPattern: value !== get().savedPattern });
  },
  markPatternSaved: (value, etag) => {
    set({ pattern: value, patternEtag: etag, dirtyPattern: false, savedPattern: value });
  },
  setExportFormat: (lastExportFormat) => set({ lastExportFormat }),
  dropCached: (id) => {
    const cache = { ...get().cache };
    delete cache[id];
    set({ cache });
  },
  bumpThumbnail: (compositionId) => {
    const current = get();
    const thumbnailFailures = { ...current.thumbnailFailures };
    delete thumbnailFailures[compositionId];
    set({
      thumbnailRevisions: {
        ...current.thumbnailRevisions,
        [compositionId]: (current.thumbnailRevisions[compositionId] ?? 0) + 1,
      },
      thumbnailFailures,
    });
  },
  markThumbnailError: (compositionId) => {
    set({
      thumbnailFailures: { ...get().thumbnailFailures, [compositionId]: true },
    });
  },
  boot: async () => {
    set({ loading: true, loadError: null });
    try {
      const [compositions, settings, runtimeCatalog, ffmpegHealth, exportJobs] = await Promise.all([
        window.studio.compositions.list(),
        window.studio.app.getSettings(),
        window.studio.runtime.catalog(),
        window.studio.app.getHealth(),
        window.studio.export.jobs(),
      ]);
      const known = new Set(compositions.map((item) => item.id));
      const openIds = rememberOpen(readOpenIds().filter((id) => known.has(id)));
      set({ compositions, runtimeCatalog, ffmpegHealth, exportJobs, openIds, loading: false });
      const saved = settings.lastCompositionId;
      const selected =
        (saved && known.has(saved) ? saved : undefined) ??
        openIds.find((id) => known.has(id)) ??
        compositions[0]?.id;
      if (selected) {
        await get().selectComposition(selected);
        const others = openIds.filter((id) => id !== selected).slice(0, 4);
        void Promise.all(
          others.map(async (id) => {
            if (get().cache[id]) return;
            try {
              const snapshot = await loadWorkspace(id);
              const current = get();
              set({ cache: { ...current.cache, [id]: snapshot } });
            } catch {
              // Keep the sidebar usable even if a background project fails to hydrate.
            }
          }),
        );
      } else {
        set({ compositionId: null, composition: null });
      }
    } catch (error) {
      set({
        loading: false,
        loadError: errorMessage(
          error instanceof Error ? error : new Error("Unable to load composition"),
        ),
      });
    }
  },
  reloadLists: async () => {
    try {
      const compositions = await window.studio.compositions.list();
      const known = new Set(compositions.map((item) => item.id));
      const openIds = rememberOpen(get().openIds.filter((id) => known.has(id)));
      set({ compositions, openIds, loadError: null });
    } catch (error) {
      set({
        loadError: errorMessage(
          error instanceof Error ? error : new Error("Unable to reload compositions"),
        ),
      });
    }
  },
  selectComposition: async (id) => {
    const current = get();
    if (current.compositionId === id && current.composition) {
      set({ openIds: rememberOpen([...current.openIds, id]) });
      return;
    }
    const captured = snapshotActive(current);
    const cache =
      captured && current.compositionId
        ? { ...current.cache, [current.compositionId]: captured }
        : current.cache;
    const cached = cache[id];
    if (cached) {
      set({
        ...applySnapshot(cached, id),
        cache,
        openIds: rememberOpen([...current.openIds, id]),
      });
      void window.studio.app.setSettings({ lastCompositionId: id });
      void get().syncDerivedDuration();
      return;
    }
    set({ loading: true, loadError: null, playing: false, cache });
    try {
      const snapshot = await loadWorkspace(id);
      set({
        ...applySnapshot(snapshot, id),
        cache: { ...get().cache, [id]: snapshot },
        openIds: rememberOpen([...get().openIds, id]),
      });
      await window.studio.app.setSettings({ lastCompositionId: id });
      await get().syncDerivedDuration();
    } catch (error) {
      set({
        loading: false,
        loadError: errorMessage(
          error instanceof Error ? error : new Error("Unable to load composition"),
        ),
      });
    }
  },
  closeProject: async (id) => {
    const current = get();
    const cache = { ...current.cache };
    delete cache[id];
    const openIds = rememberOpen(current.openIds.filter((item) => item !== id));
    if (current.compositionId !== id) {
      set({ cache, openIds });
      return;
    }
    const next = openIds.at(-1) ?? current.compositions.find((item) => item.id !== id)?.id;
    set({ cache, openIds });
    if (next) await get().selectComposition(next);
    else {
      set({
        compositionId: null,
        composition: null,
        media: emptyMedia,
        controls: [],
        files: [],
        playing: false,
      });
      await window.studio.app.setSettings({ lastCompositionId: null });
    }
  },
  createComposition: async (example) => {
    const composition = example
      ? await window.studio.compositions.create({ example })
      : await window.studio.compositions.create({ name: "Untitled" });
    await get().reloadLists();
    await get().selectComposition(composition.id);
  },
  duplicateComposition: async (id) => {
    const composition = await window.studio.compositions.duplicate(id);
    await get().reloadLists();
    await get().selectComposition(composition.id);
  },
  saveProject: async (id) => {
    await flushDirtySources(get, set, id);
    return window.studio.compositions.saveProject(id);
  },
  importProject: async () => {
    const imported = await window.studio.compositions.importProject();
    if (!imported) return null;
    await get().reloadLists();
    await get().selectComposition(imported.composition.id);
    return { catalogMismatch: imported.catalogMismatch };
  },
  removeComposition: async () => {
    const id = get().compositionId;
    if (!id) return;
    await window.studio.compositions.remove(id);
    const cache = { ...get().cache };
    delete cache[id];
    const openIds = rememberOpen(get().openIds.filter((item) => item !== id));
    set({ cache, openIds });
    await get().reloadLists();
    const next = get().openIds.at(-1) ?? get().compositions.at(-1)?.id;
    if (next) await get().selectComposition(next);
    else {
      set({ compositionId: null, composition: null, media: emptyMedia, controls: [], files: [] });
      await window.studio.app.setSettings({ lastCompositionId: null });
    }
  },
  refreshComposition: async () => {
    const id = get().compositionId;
    if (!id) return;
    const composition = await window.studio.compositions.get(id);
    set({ composition });
    await get().reloadLists();
  },
  refreshMedia: async () => {
    const id = get().compositionId;
    if (!id) return;
    set({ media: await window.studio.media.get(id) });
  },
  refreshControls: async () => {
    const id = get().compositionId;
    if (!id) return;
    set({ controls: (await window.studio.controls.get(id)).controls });
  },
  refreshActivity: async () => {
    const id = get().compositionId;
    if (!id) return;
    set({ activity: await window.studio.activity.list(id) });
  },
  refreshFiles: async () => {
    const id = get().compositionId;
    const files = id ? await window.studio.files.list(id) : [];
    set({ files });
    return files;
  },
  refreshExports: async () => {
    const id = get().compositionId;
    const [exports, exportJobs] = await Promise.all([
      id ? window.studio.export.list(id) : Promise.resolve([]),
      window.studio.export.jobs(),
    ]);
    set({ exports, exportJobs });
  },
  refreshHealth: async () => {
    set({ ffmpegHealth: await window.studio.app.getHealth() });
  },
  reorderCompositions: async (ids) => {
    set({ compositions: await window.studio.compositions.reorder(ids) });
  },
  addLibraryAsset: async (asset, start, lane) => {
    const id = get().compositionId;
    if (!id) return;
    await addAssetToTimeline(id, asset, (track) => get().putTrack(track), start, lane);
  },
  updateSettings: async (input) => {
    const id = get().compositionId;
    if (!id) return;
    const composition = await window.studio.compositions.updateSettings({
      compositionId: id,
      ...input,
    });
    set({ composition });
    await get().reloadLists();
  },
  putTrack: async (track, persist = true) => {
    const id = get().compositionId;
    if (!id) return;
    set({
      media: { ...get().media, tracks: upsertById(get().media.tracks, track) },
      selectedTrackId: track.id,
      selectedMarkerId: null,
    });
    if (!persist) return;
    const epoch = get().writeEpoch + 1;
    const key = writeKey("track", track.id);
    set({ writeEpoch: epoch, pendingWrites: { ...get().pendingWrites, [key]: epoch } });
    try {
      const document = await window.studio.media.putTrack(id, track);
      const current = get();
      if (current.pendingWrites[key] !== epoch) return;
      const pendingWrites = { ...current.pendingWrites };
      delete pendingWrites[key];
      const composition = await fittedComposition(current.composition, id, document.tracks);
      set({
        pendingWrites,
        composition,
        compositions: composition
          ? current.compositions.map((item) => (item.id === composition.id ? composition : item))
          : current.compositions,
        playheadSeconds: Math.min(
          current.playheadSeconds,
          composition?.durationSeconds ?? current.playheadSeconds,
        ),
        media: {
          ...document,
          tracks: document.tracks.map((item) =>
            current.pendingWrites[writeKey("track", item.id)] !== undefined
              ? (current.media.tracks.find((local) => local.id === item.id) ?? item)
              : item,
          ),
        },
      });
    } catch {
      const current = get();
      if (current.pendingWrites[key] !== epoch) return;
      const pendingWrites = { ...current.pendingWrites };
      delete pendingWrites[key];
      set({ pendingWrites });
    }
  },
  putTracks: async (tracks, persist = true) => {
    const id = get().compositionId;
    if (!id) return;
    set({ media: { ...get().media, tracks } });
    if (!persist) return;
    const epoch = get().writeEpoch + 1;
    const pendingWrites = { ...get().pendingWrites };
    for (const track of tracks) pendingWrites[writeKey("track", track.id)] = epoch;
    set({ writeEpoch: epoch, pendingWrites });
    try {
      let document = get().media;
      for (const track of tracks) {
        document = await window.studio.media.putTrack(id, track);
      }
      const current = get();
      const nextPending = { ...current.pendingWrites };
      for (const track of tracks) {
        if (nextPending[writeKey("track", track.id)] === epoch) {
          delete nextPending[writeKey("track", track.id)];
        }
      }
      const composition = await fittedComposition(current.composition, id, document.tracks);
      set({
        pendingWrites: nextPending,
        composition,
        compositions: composition
          ? current.compositions.map((item) => (item.id === composition.id ? composition : item))
          : current.compositions,
        playheadSeconds: Math.min(
          current.playheadSeconds,
          composition?.durationSeconds ?? current.playheadSeconds,
        ),
        media: document,
      });
    } catch {
      const current = get();
      const nextPending = { ...current.pendingWrites };
      for (const track of tracks) {
        if (nextPending[writeKey("track", track.id)] === epoch) {
          delete nextPending[writeKey("track", track.id)];
        }
      }
      set({ pendingWrites: nextPending });
    }
  },
  createBlock: async (name, start, lane) => {
    const id = get().compositionId;
    if (!id) return;
    const selected = get().media.tracks.find((track) => track.id === get().selectedTrackId);
    const track = await window.studio.media.createBlock(
      id,
      name,
      start ?? get().playheadSeconds,
      lane ?? selected?.lane,
    );
    const media = await window.studio.media.get(id);
    const composition = await fittedComposition(get().composition, id, media.tracks);
    const code = await readBlockCode(id, blockDirectory(track.asset));
    set({
      composition,
      compositions: composition
        ? get().compositions.map((item) => (item.id === composition.id ? composition : item))
        : get().compositions,
      media,
      selectedTrackId: track.id,
      selectedMarkerId: null,
      ...code,
      dirtyHtml: false,
      dirtyCss: false,
      dirtyJs: false,
    });
  },
  createMusicBlock: async (name, start, lane) => {
    const id = get().compositionId;
    if (!id) return;
    const selected = get().media.tracks.find((track) => track.id === get().selectedTrackId);
    const track = await window.studio.media.createMusicBlock(
      id,
      name,
      start ?? get().playheadSeconds,
      lane ?? selected?.lane,
    );
    const media = await window.studio.media.get(id);
    const composition = await fittedComposition(get().composition, id, media.tracks);
    const pattern = await readMusicPattern(id, track.asset);
    set({
      composition,
      compositions: composition
        ? get().compositions.map((item) => (item.id === composition.id ? composition : item))
        : get().compositions,
      media,
      selectedTrackId: track.id,
      selectedMarkerId: null,
      ...pattern,
      dirtyPattern: false,
    });
  },
  deleteTrack: async (trackId) => {
    const id = get().compositionId;
    if (!id) return;
    const media = await window.studio.media.deleteTrack(id, trackId);
    const composition = await fittedComposition(get().composition, id, media.tracks);
    const playheadSeconds = Math.min(
      get().playheadSeconds,
      composition?.durationSeconds ?? get().playheadSeconds,
    );
    set({
      composition,
      compositions: composition
        ? get().compositions.map((item) => (item.id === composition.id ? composition : item))
        : get().compositions,
      media,
      playheadSeconds,
      selectedTrackId: media.tracks[0]?.id ?? null,
      selectedMarkerId: null,
    });
  },
  putMarker: async (marker) => {
    const id = get().compositionId;
    if (!id) return;
    set({
      media: await window.studio.media.putMarker(id, marker),
      selectedMarkerId: marker.id,
      selectedTrackId: null,
    });
  },
  deleteMarker: async (markerId) => {
    const id = get().compositionId;
    if (!id) return;
    const media = await window.studio.media.deleteMarker(id, markerId);
    set({
      media,
      selectedMarkerId: media.markers[0]?.id ?? null,
      selectedTrackId: null,
    });
  },
  previewControl: (control) => {
    set({ controls: upsertById(get().controls, control) });
  },
  putControl: async (control) => {
    const id = get().compositionId;
    if (!id) return;
    set({ controls: upsertById(get().controls, control) });
    const epoch = get().writeEpoch + 1;
    const key = writeKey("control", control.id);
    set({ writeEpoch: epoch, pendingWrites: { ...get().pendingWrites, [key]: epoch } });
    try {
      const document = await window.studio.controls.put(id, control);
      const current = get();
      if (current.pendingWrites[key] !== epoch) return;
      const pendingWrites = { ...current.pendingWrites };
      delete pendingWrites[key];
      set({
        pendingWrites,
        controls: document.controls.map((item) =>
          current.pendingWrites[writeKey("control", item.id)] !== undefined
            ? (current.controls.find((local) => local.id === item.id) ?? item)
            : item,
        ),
      });
    } catch {
      const current = get();
      if (current.pendingWrites[key] !== epoch) return;
      const pendingWrites = { ...current.pendingWrites };
      delete pendingWrites[key];
      set({ pendingWrites });
    }
  },
  hasPendingWrite: (kind, id) => get().pendingWrites[writeKey(kind, id)] !== undefined,
  runValidation: async () => {
    const id = get().compositionId;
    if (!id) return;
    set({ validation: await window.studio.validate.run(id) });
  },
  syncDerivedDuration: async () => {
    const id = get().compositionId;
    const composition = get().composition;
    if (!id || !composition) return;
    const next = contentDuration(get().media.tracks);
    if (Math.abs(next - composition.durationSeconds) < 1e-6) return;
    const updated = await window.studio.compositions.updateSettings({
      compositionId: id,
      durationSeconds: next,
    });
    set({
      composition: updated,
      compositions: get().compositions.map((item) => (item.id === updated.id ? updated : item)),
      playheadSeconds: Math.min(get().playheadSeconds, updated.durationSeconds),
    });
  },
  refreshLoopSeam: async () => {
    const id = get().compositionId;
    if (!id) {
      set({ loopSeam: null });
      return;
    }
    const epoch = get().loopSeamEpoch + 1;
    set({ loopSeam: null, loopSeamEpoch: epoch });
    try {
      const result = await window.studio.compositions.loopSeam(id);
      if (get().loopSeamEpoch !== epoch || get().compositionId !== id) return;
      set({ loopSeam: result.match });
    } catch {
      if (get().loopSeamEpoch !== epoch) return;
      set({ loopSeam: null });
    }
  },
}));
