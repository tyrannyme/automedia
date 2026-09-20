import type { ExportJob } from "../../main/export.ts";
import type { StudioEvent } from "../../main/events.ts";
import { isMusicPatternPath } from "@shared/music-paths.ts";
import { codeFileFromPath, type CodeFile } from "./block-paths.ts";
import { isThumbnailStudioEvent } from "./studio-events.ts";

export type StudioSyncContext = {
  compositionId: string | null;
  pendingTrack: boolean;
  pendingControl: boolean;
  dirtyHtml: boolean;
  dirtyCss: boolean;
  dirtyJs: boolean;
  dirtyPattern: boolean;
};

export type StudioSyncPlan = {
  bumpThumbnail?: string;
  markThumbnailError?: string;
  exportJob?: ExportJob;
  refreshExports?: boolean;
  dropCached?: string;
  reloadLists?: boolean;
  selectComposition?: string;
  closeComposition?: string;
  refreshActivity?: boolean;
  refreshComposition?: boolean;
  bumpIframe?: boolean;
  refreshMedia?: boolean;
  refreshControls?: boolean;
  refreshFiles?: boolean;
  reloadCode?: { path: string; file: CodeFile };
  reloadPattern?: { path: string };
};

export function planStudioEvent(event: StudioEvent, context: StudioSyncContext): StudioSyncPlan {
  const plan: StudioSyncPlan = {};
  if (isThumbnailStudioEvent(event.type)) {
    if (event.type === "thumbnail_ready" && event.compositionId) {
      plan.bumpThumbnail = event.compositionId;
    }
    if (event.type === "thumbnail_error" && event.compositionId) {
      plan.markThumbnailError = event.compositionId;
    }
    return plan;
  }
  if (
    event.type === "export" &&
    event.payload &&
    "phase" in event.payload &&
    "id" in event.payload
  ) {
    // SAFETY: export events are emitted with an ExportJob payload by the main process.
    const job = event.payload as ExportJob;
    plan.exportJob = job;
    if (job.phase === "completed" && event.compositionId === context.compositionId) {
      plan.refreshExports = true;
    }
  }
  if (event.type === "create_composition" && event.compositionId) {
    plan.reloadLists = true;
    plan.selectComposition = event.compositionId;
  }
  if (event.type === "delete_composition" && event.compositionId) {
    plan.reloadLists = true;
    if (event.compositionId === context.compositionId) {
      plan.closeComposition = event.compositionId;
      return plan;
    }
  }
  if (
    event.type === "update_settings" &&
    event.compositionId &&
    event.compositionId !== context.compositionId
  ) {
    plan.reloadLists = true;
  }
  if (event.compositionId && event.compositionId !== context.compositionId) {
    plan.dropCached = event.compositionId;
    return plan;
  }
  if (!context.compositionId || event.compositionId !== context.compositionId) return plan;
  const payload = event.payload;
  const trackId = payload && "trackId" in payload ? payload.trackId : null;
  const controlId = payload && "controlId" in payload ? payload.controlId : null;
  if (!["put_track", "put_control", "put_marker"].includes(event.type)) {
    plan.refreshActivity = true;
  }
  const path = event.payload && "path" in event.payload ? event.payload.path : "";
  if (event.type === "update_settings") {
    plan.refreshComposition = true;
    plan.bumpIframe = true;
  }
  if (["put_track", "delete_track", "put_marker", "delete_marker"].includes(event.type)) {
    if (!(trackId && context.pendingTrack)) plan.refreshMedia = true;
  }
  if (["put_control", "delete_control"].includes(event.type)) {
    if (!(controlId && context.pendingControl)) plan.refreshControls = true;
  }
  if (event.type === "write_file" || event.type === "delete_file") plan.refreshFiles = true;
  if (event.type === "write_file" && path) {
    const file = codeFileFromPath(path);
    const dirty =
      file === "html"
        ? context.dirtyHtml
        : file === "css"
          ? context.dirtyCss
          : file === "js"
            ? context.dirtyJs
            : false;
    if (file && !dirty) {
      plan.reloadCode = { path, file };
      plan.bumpIframe = true;
    }
    if (isMusicPatternPath(path) && !context.dirtyPattern) {
      plan.reloadPattern = { path };
      plan.bumpIframe = true;
    }
  }
  return plan;
}
