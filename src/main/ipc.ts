import { app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import * as v from "valibot";
import { AppError, toErrorObject } from "@shared/errors.ts";
import { Result } from "better-result";
import { appInfoSchema, ipcChannels, type IpcResult } from "@shared/ipc.ts";
import { imageExtensions, mediaExtensions } from "@shared/limits.ts";
import { appSettingsSchema, idSchema } from "@shared/schemas.ts";
import {
  ensureProjectArchiveExtension,
  projectArchiveExtension,
  projectArchiveFileName,
} from "@shared/project-archive.ts";
import type { Engine, OperationName } from "../engine/operations.ts";
import { readSettings, writeSettings } from "./settings.ts";

export function handleIpc<TSchema extends v.GenericSchema, TOutput>(
  channel: string,
  inputSchema: TSchema,
  handler: (input: v.InferOutput<TSchema>, event: IpcMainInvokeEvent) => Promise<TOutput> | TOutput,
): void {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<TOutput>> => {
    const result = await Result.tryPromise({
      try: async () => handler(v.parse(inputSchema, raw), event),
      catch: (cause) => {
        if (cause instanceof AppError) return cause;
        return new AppError(
          "internal",
          cause instanceof Error && cause.message.length > 0 ? cause.message : "Unexpected error",
        );
      },
    });
    if (result.isOk()) {
      return { ok: true, data: result.value };
    }
    return { ok: false, error: toErrorObject(result.error) };
  });
}

const noArgs = v.undefined();
const compositionInput = v.object({ compositionId: idSchema });
/** The engine parses every operation's input, so forwarded calls pass it through. */
const engineInput = v.any();

/**
 * The studio is a client of the engine. Library calls go to it unchanged;
 * this process keeps only what needs a window: settings, file dialogs, and
 * revealing files.
 */
export function registerIpcHandlers(engine: Engine, userData: string): void {
  const forward = (channel: string, operation: OperationName) => {
    handleIpc(channel, engineInput, (input) => engine.call(operation, input));
  };

  handleIpc(ipcChannels.app.getInfo, noArgs, () =>
    v.parse(appInfoSchema, { name: app.getName(), version: app.getVersion() }),
  );
  handleIpc(ipcChannels.app.getSettings, noArgs, () => readSettings(userData));
  handleIpc(ipcChannels.app.setSettings, appSettingsSchema, (settings) =>
    writeSettings(userData, settings),
  );

  forward(ipcChannels.compositions.list, "listCompositions");
  forward(ipcChannels.compositions.get, "getComposition");
  forward(ipcChannels.compositions.create, "createComposition");
  forward(ipcChannels.compositions.updateSettings, "updateSettings");
  forward(ipcChannels.compositions.remove, "deleteComposition");
  forward(ipcChannels.compositions.duplicate, "duplicateComposition");
  forward(ipcChannels.compositions.reorder, "reorderCompositions");
  forward(ipcChannels.compositions.loopSeam, "checkLoopSeam");
  handleIpc(ipcChannels.compositions.saveProject, compositionInput, async ({ compositionId }) => {
    const composition = await engine.call("getComposition", { compositionId });
    const result = await dialog.showSaveDialog({
      defaultPath: projectArchiveFileName(composition.name),
      filters: [{ name: "Automedia project", extensions: [projectArchiveExtension] }],
    });
    if (result.canceled || !result.filePath) return null;
    return engine.call("saveProject", {
      compositionId,
      path: ensureProjectArchiveExtension(result.filePath),
    });
  });
  handleIpc(ipcChannels.compositions.importProject, noArgs, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Automedia project", extensions: [projectArchiveExtension] }],
    });
    const source = result.filePaths[0];
    if (result.canceled || !source) return null;
    return engine.call("importProject", { path: source });
  });

  forward(ipcChannels.files.list, "listFiles");
  forward(ipcChannels.files.read, "readFile");
  forward(ipcChannels.files.write, "writeFile");
  forward(ipcChannels.files.delete, "deleteFile");

  forward(ipcChannels.media.get, "getMedia");
  forward(ipcChannels.media.probe, "probeMedia");
  forward(ipcChannels.media.createBlock, "createBlock");
  forward(ipcChannels.media.createMusicBlock, "createMusicBlock");
  forward(ipcChannels.media.putTrack, "putTrack");
  forward(ipcChannels.media.deleteTrack, "deleteTrack");
  forward(ipcChannels.media.putMarker, "putMarker");
  forward(ipcChannels.media.deleteMarker, "deleteMarker");

  forward(ipcChannels.controls.get, "listControls");
  forward(ipcChannels.controls.put, "putControl");
  forward(ipcChannels.controls.delete, "deleteControl");

  forward(ipcChannels.activity.list, "getActivity");
  forward(ipcChannels.runtime.catalog, "getRuntimeCatalog");
  forward(ipcChannels.validate.run, "validate");

  forward(ipcChannels.export.start, "startExport");
  forward(ipcChannels.export.get, "getExport");
  forward(ipcChannels.export.cancel, "cancelExport");
  forward(ipcChannels.export.list, "listExports");
  forward(ipcChannels.export.jobs, "listExportJobs");
  handleIpc(ipcChannels.export.reveal, compositionInput, async ({ compositionId }) => {
    const newest = await engine.call("newestExport", { compositionId });
    shell.showItemInFolder(newest.path);
  });
  handleIpc(ipcChannels.export.saveCopy, compositionInput, async ({ compositionId }) => {
    const newest = await engine.call("newestExport", { compositionId });
    const result = await dialog.showSaveDialog({ defaultPath: newest.fileName });
    if (result.canceled || !result.filePath) return;
    await engine.call("copyExport", {
      compositionId,
      fileName: newest.fileName,
      destination: result.filePath,
    });
  });

  handleIpc(ipcChannels.assets.import, compositionInput, async ({ compositionId }) => {
    await engine.call("getComposition", { compositionId });
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Media", extensions: [...mediaExtensions, ...imageExtensions] }],
    });
    const source = result.filePaths[0];
    if (result.canceled || !source) return null;
    return engine.call("importAsset", { compositionId, source });
  });
}
