import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import * as v from "valibot";
import { ipcChannels, type UpdateState } from "@shared/ipc.ts";
import { handleIpc } from "./ipc.ts";

const checkIntervalMs = 60 * 60 * 1000;
const noArgs = v.undefined();

/**
 * Only the AppImage and the NSIS install can replace themselves. The zips,
 * and dev runs, never see an update.
 */
function canSelfUpdate(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "linux") return process.env.APPIMAGE !== undefined;
  if (process.platform === "win32") {
    const uninstaller = `Uninstall ${app.getName()}.exe`;
    return existsSync(path.join(path.dirname(process.execPath), uninstaller));
  }
  return false;
}

function releaseNotes(info: UpdateInfo): string {
  const notes = info.releaseNotes ?? "";
  return Array.isArray(notes) ? notes.map((note) => note.note ?? "").join("\n") : notes;
}

/** Checks hourly, downloads on request, installs on request or on quit. */
export function startUpdates(): void {
  let state: UpdateState = { status: "none" };
  let appImage = process.env.APPIMAGE ?? process.execPath;
  const set = (next: UpdateState) => {
    state = next;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.updates.changed, state);
    }
  };

  handleIpc(ipcChannels.updates.get, noArgs, () => state);
  handleIpc(ipcChannels.updates.download, noArgs, async () => {
    if (state.status !== "available") return;
    set({ ...state, status: "downloading", progress: 0, error: null });
    await autoUpdater.downloadUpdate();
  });
  handleIpc(ipcChannels.updates.install, noArgs, () => {
    if (state.status !== "ready") return;
    if (process.platform !== "linux") {
      // The installer waits for this process to exit, then starts the new one.
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    // The AppImage updater would start the new build before this one frees
    // the loopback port. Swap the file now and relaunch after exit instead.
    autoUpdater.quitAndInstall(true, false);
    app.relaunch({ execPath: appImage });
  });

  if (!canSelfUpdate()) return;

  autoUpdater.autoDownload = false;
  autoUpdater.on("appimage-filename-updated", (file: string) => {
    appImage = file;
  });
  autoUpdater.on("update-available", (info) => {
    set({
      status: "available",
      version: info.version,
      notes: releaseNotes(info),
      progress: 0,
      error: null,
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    if (state.status === "downloading") set({ ...state, progress: progress.percent });
  });
  autoUpdater.on("update-downloaded", () => {
    if (state.status !== "none") set({ ...state, status: "ready", progress: 100 });
  });
  autoUpdater.on("error", (error) => {
    console.error("update failed", error);
    if (state.status === "downloading") {
      set({ ...state, status: "available", progress: 0, error: error.message });
    }
  });

  const check = () => {
    // A download in flight or waiting to install is not replaced by a newer one.
    if (state.status === "downloading" || state.status === "ready") return;
    autoUpdater.checkForUpdates().catch(() => {
      // The error event already logged it. Offline is the usual cause.
    });
  };
  check();
  setInterval(check, checkIntervalMs);
}
