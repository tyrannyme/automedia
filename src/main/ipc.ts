import { copyFile } from "node:fs/promises";
import path from "node:path";
import { app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import * as v from "valibot";
import { AppError, mapMissingBinaryError, toErrorObject } from "@shared/errors.ts";
import { Result } from "better-result";
import { appInfoSchema, ipcChannels, type IpcResult } from "@shared/ipc.ts";
import { imageExtensions, mediaExtensions } from "@shared/limits.ts";
import { isAssetExtension } from "@shared/media.ts";
import {
  controlIdSchema,
  controlSchema,
  idSchema,
  markerSchema,
  mediaTrackSchema,
  probeMediaInputSchema,
  readFileInputSchema,
  startExportInputSchema,
  updateSettingsSchema,
  writeFileInputSchema,
  appSettingsSchema,
} from "@shared/schemas.ts";
import { logOperation } from "./activity.ts";
import type { ActivityDetail } from "./events.ts";
import { EventBus } from "./events.ts";
import { ExportQueue, listExports, type ExportJob } from "./export.ts";
import { createId, pathExists, readBytes, resolveInside } from "./fs.ts";
import { probeFile } from "./probe.ts";
import { runtimeCatalog } from "./runtime.ts";
import { ffmpegHealth } from "./ffmpeg.ts";
import { readSettings, writeSettings } from "./settings.ts";
import { CompositionStore } from "./store.ts";
import { validateComposition, type LoopbackUrlSource } from "./validate.ts";
import { writeExample, type ExampleId } from "./examples/index.ts";
import {
  ensureProjectArchiveExtension,
  projectArchiveExtension,
  projectArchiveFileName,
} from "@shared/project-archive.ts";

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
        const missing = mapMissingBinaryError(cause);
        if (missing) return missing;
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

type IpcOptions = {
  store: CompositionStore;
  queue: ExportQueue;
  events: EventBus;
  userData: string;
  loopbackUrl?: LoopbackUrlSource;
  loopSeam?: (compositionId: string) => Promise<{ match: boolean }>;
};

const noArgs = v.undefined();
const compositionInput = v.object({ compositionId: idSchema });

export function registerIpcHandlers({
  store,
  queue,
  events,
  userData,
  loopbackUrl,
  loopSeam,
}: IpcOptions): void {
  const record = (
    operation: string,
    compositionId: string,
    detail?: ActivityDetail,
  ): Promise<void> => logOperation(store, events, operation, compositionId, detail);

  handleIpc(ipcChannels.app.getInfo, noArgs, () =>
    v.parse(appInfoSchema, { name: app.getName(), version: app.getVersion() }),
  );
  handleIpc(ipcChannels.app.getSettings, noArgs, () => readSettings(userData));
  handleIpc(ipcChannels.app.setSettings, appSettingsSchema, (settings) =>
    writeSettings(userData, settings),
  );
  handleIpc(ipcChannels.app.getHealth, noArgs, () => ffmpegHealth());

  handleIpc(ipcChannels.compositions.list, noArgs, () => store.list());
  handleIpc(ipcChannels.compositions.get, compositionInput, ({ compositionId }) =>
    store.get(compositionId),
  );
  handleIpc(
    ipcChannels.compositions.create,
    v.optional(
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1))),
        example: v.optional(v.string()),
      }),
    ),
    async (input) => {
      // SAFETY: writeExample performs the runtime unknown-example check for this user input.
      const composition =
        input?.example !== undefined
          ? await writeExample(store, input.example as ExampleId)
          : await store.create(input?.name);
      if (input?.example !== undefined && input.name) {
        await store.updateSettings({ compositionId: composition.id, name: input.name });
      }
      await record("create_composition", composition.id, { name: input?.name ?? composition.name });
      return store.get(composition.id);
    },
  );
  handleIpc(ipcChannels.compositions.updateSettings, updateSettingsSchema, async (input) => {
    const composition = await store.updateSettings(input);
    await record("update_settings", composition.id, input);
    return composition;
  });
  handleIpc(ipcChannels.compositions.remove, compositionInput, async ({ compositionId }) => {
    await store.get(compositionId);
    await record("delete_composition", compositionId);
    await store.remove(compositionId);
  });
  handleIpc(ipcChannels.compositions.duplicate, compositionInput, async ({ compositionId }) => {
    const composition = await store.duplicate(compositionId);
    await record("create_composition", composition.id, { name: composition.name });
    return composition;
  });
  handleIpc(ipcChannels.compositions.saveProject, compositionInput, async ({ compositionId }) => {
    const composition = await store.get(compositionId);
    const result = await dialog.showSaveDialog({
      defaultPath: projectArchiveFileName(composition.name),
      filters: [{ name: "Automedia project", extensions: [projectArchiveExtension] }],
    });
    if (result.canceled || !result.filePath) return null;
    const dest = ensureProjectArchiveExtension(result.filePath);
    await store.saveProject(compositionId, dest, app.getVersion(), runtimeCatalog);
    return { path: dest };
  });
  handleIpc(ipcChannels.compositions.importProject, noArgs, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Automedia project", extensions: [projectArchiveExtension] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const source = result.filePaths[0];
    if (!source) return null;
    const imported = await store.importProject(source, runtimeCatalog);
    await record("create_composition", imported.composition.id, {
      name: imported.composition.name,
    });
    return imported;
  });
  handleIpc(ipcChannels.compositions.reorder, v.object({ ids: v.array(idSchema) }), ({ ids }) =>
    store.reorder(ids),
  );
  handleIpc(ipcChannels.compositions.loopSeam, compositionInput, async ({ compositionId }) => {
    await store.get(compositionId);
    if (!loopSeam) throw new AppError("internal", "loop seam is not ready");
    return loopSeam(compositionId);
  });

  handleIpc(ipcChannels.files.list, compositionInput, ({ compositionId }) =>
    store.listFiles(compositionId),
  );
  handleIpc(ipcChannels.files.read, readFileInputSchema, ({ compositionId, path: relativePath }) =>
    store.readFile(compositionId, relativePath),
  );
  handleIpc(ipcChannels.files.write, writeFileInputSchema, async (input) => {
    const file = await store.writeFile(
      input.compositionId,
      input.path,
      input.encoding,
      input.content,
      input.expectedEtag,
    );
    await record("write_file", input.compositionId, { path: input.path });
    return file;
  });
  handleIpc(
    ipcChannels.files.delete,
    readFileInputSchema,
    async ({ compositionId, path: relativePath }) => {
      await store.deleteFile(compositionId, relativePath);
      await record("delete_file", compositionId, { path: relativePath });
    },
  );

  handleIpc(ipcChannels.media.get, compositionInput, ({ compositionId }) =>
    store.getMedia(compositionId),
  );
  handleIpc(ipcChannels.media.probe, probeMediaInputSchema, async ({ compositionId, asset }) => {
    await store.get(compositionId);
    const filePath = resolveInside(path.join(store.compositionDir(compositionId), "assets"), asset);
    return probeFile(filePath);
  });
  handleIpc(
    ipcChannels.media.createBlock,
    v.object({
      compositionId: idSchema,
      name: v.optional(v.string()),
      start: v.optional(v.pipe(v.number(), v.minValue(0))),
      lane: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    }),
    async ({ compositionId, name, start, lane }) => {
      const track = await store.createBlock(compositionId, name, start, lane);
      await record("put_track", compositionId, { trackId: track.id });
      return track;
    },
  );
  handleIpc(
    ipcChannels.media.createMusicBlock,
    v.object({
      compositionId: idSchema,
      name: v.optional(v.string()),
      start: v.optional(v.pipe(v.number(), v.minValue(0))),
      lane: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
    }),
    async ({ compositionId, name, start, lane }) => {
      const track = await store.createMusicBlock(compositionId, name, start, lane);
      await record("put_track", compositionId, { trackId: track.id });
      return track;
    },
  );
  handleIpc(
    ipcChannels.media.putTrack,
    v.object({ compositionId: idSchema, track: mediaTrackSchema }),
    async ({ compositionId, track }) => {
      const media = await store.putTrack(compositionId, track);
      await record("put_track", compositionId, { trackId: track.id });
      return media;
    },
  );
  handleIpc(
    ipcChannels.media.deleteTrack,
    v.object({ compositionId: idSchema, trackId: idSchema }),
    async ({ compositionId, trackId }) => {
      const media = await store.deleteTrack(compositionId, trackId);
      await record("delete_track", compositionId, { trackId });
      return media;
    },
  );
  handleIpc(
    ipcChannels.media.putMarker,
    v.object({ compositionId: idSchema, marker: markerSchema }),
    async ({ compositionId, marker }) => {
      const media = await store.putMarker(compositionId, marker);
      await record("put_marker", compositionId, { markerId: marker.id });
      return media;
    },
  );
  handleIpc(
    ipcChannels.media.deleteMarker,
    v.object({ compositionId: idSchema, markerId: idSchema }),
    async ({ compositionId, markerId }) => {
      const media = await store.deleteMarker(compositionId, markerId);
      await record("delete_marker", compositionId, { markerId });
      return media;
    },
  );

  handleIpc(ipcChannels.controls.get, compositionInput, ({ compositionId }) =>
    store.getControls(compositionId),
  );
  handleIpc(
    ipcChannels.controls.put,
    v.object({ compositionId: idSchema, control: controlSchema }),
    async ({ compositionId, control }) => {
      const document = await store.putControl(compositionId, control);
      await record("put_control", compositionId, { controlId: control.id });
      return document;
    },
  );
  handleIpc(
    ipcChannels.controls.delete,
    v.object({ compositionId: idSchema, controlId: controlIdSchema }),
    async ({ compositionId, controlId }) => {
      const document = await store.deleteControl(compositionId, controlId);
      await record("delete_control", compositionId, { controlId });
      return document;
    },
  );

  handleIpc(ipcChannels.activity.list, compositionInput, ({ compositionId }) =>
    store.listActivity(compositionId),
  );
  handleIpc(ipcChannels.runtime.catalog, noArgs, () => runtimeCatalog);
  handleIpc(ipcChannels.validate.run, compositionInput, async ({ compositionId }) => {
    const composition = await store.get(compositionId);
    const media = await store.getMedia(compositionId);
    const report = await validateComposition(composition, media, loopbackUrl);
    await record("validate", compositionId, { ok: report.ok });
    return report;
  });

  handleIpc(ipcChannels.export.start, startExportInputSchema, async (input) => {
    const job = await queue.start(input);
    await record("start_export", input.compositionId, { jobId: job.id, format: job.format });
    return job;
  });
  handleIpc(ipcChannels.export.get, v.object({ jobId: idSchema }), ({ jobId }) => queue.get(jobId));
  handleIpc(ipcChannels.export.cancel, v.object({ jobId: idSchema }), async ({ jobId }) => {
    const job = queue.cancel(jobId);
    await record("cancel_export", job.compositionId, { jobId });
    return job;
  });
  handleIpc(ipcChannels.export.list, compositionInput, ({ compositionId }) =>
    listExports(store, compositionId),
  );
  handleIpc(ipcChannels.export.jobs, noArgs, () => queue.listJobs());
  handleIpc(ipcChannels.export.reveal, compositionInput, async ({ compositionId }) => {
    const newest = (await listExports(store, compositionId))[0];
    if (!newest) {
      throw new AppError("not_found", "no exports exist");
    }
    shell.showItemInFolder(
      path.join(store.compositionDir(compositionId), "exports", newest.fileName),
    );
  });
  handleIpc(ipcChannels.export.saveCopy, compositionInput, async ({ compositionId }) => {
    const newest = (await listExports(store, compositionId))[0];
    if (!newest) {
      throw new AppError("not_found", "no exports exist");
    }
    const result = await dialog.showSaveDialog({ defaultPath: newest.fileName });
    if (result.canceled || !result.filePath) {
      return;
    }
    await copyFile(
      path.join(store.compositionDir(compositionId), "exports", newest.fileName),
      result.filePath,
    );
  });

  handleIpc(ipcChannels.assets.import, compositionInput, async ({ compositionId }) => {
    await store.get(compositionId);
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Media", extensions: [...mediaExtensions, ...imageExtensions] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const source = result.filePaths[0];
    if (!source) {
      return null;
    }
    const sourceExtension = path.extname(source).slice(1).toLowerCase();
    if (!isAssetExtension(sourceExtension)) {
      throw new AppError("invalid_asset", "unsupported media extension");
    }
    const assetsDir = path.join(store.compositionDir(compositionId), "assets");
    const originalName = path.basename(source).toLowerCase();
    let asset = originalName;
    if (await pathExists(path.join(assetsDir, asset))) {
      asset = `${createId("a")}-${asset}`;
    }
    const bytes = await readBytes(source);
    await store.writeFile(
      compositionId,
      path.posix.join("assets", asset),
      "base64",
      bytes.toString("base64"),
      "",
    );
    await record("write_file", compositionId, {
      path: path.posix.join("assets", asset),
    });
    return { asset };
  });
}

export type { ExportJob };
