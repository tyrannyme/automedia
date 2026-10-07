import { copyFile } from "node:fs/promises";
import path from "node:path";
import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import { isAssetExtension } from "@shared/media.ts";
import { ensureProjectArchiveExtension } from "@shared/project-archive.ts";
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
} from "@shared/schemas.ts";
import { logOperation } from "./activity.ts";
import type { ActivityDetail, EventBus } from "./events.ts";
import { listExamples, writeExample, type ExampleId } from "./examples/index.ts";
import { listExports, type ExportQueue } from "./export.ts";
import { createId, pathExists, readBytes, resolveInside } from "./fs.ts";
import type { LoopbackUrlSource } from "./loopback.ts";
import { probeFile } from "./probe.ts";
import type { RenderPool } from "./render-pool.ts";
import { getRuntimeTypes, runtimeCatalog } from "./runtime.ts";
import type { CompositionStore } from "./store.ts";
import type { ThumbnailService } from "./thumbnails.ts";
import { validateComposition } from "./validate.ts";
import { engineVersion } from "./version.ts";

/** Who asked. Exports and checks are shared fairly between owners. */
export type Caller = { owner: string };

export type EngineContext = {
  store: CompositionStore;
  events: EventBus;
  queue: ExportQueue;
  pool: RenderPool;
  thumbnails?: ThumbnailService | undefined;
  loopbackUrl?: LoopbackUrlSource;
};

type Operation<TSchema extends v.GenericSchema, TResult> = {
  input: TSchema;
  run(input: v.InferOutput<TSchema>, caller: Caller): Promise<TResult>;
};

function operation<TSchema extends v.GenericSchema, TResult>(
  input: TSchema,
  run: (input: v.InferOutput<TSchema>, caller: Caller) => Promise<TResult> | TResult,
): Operation<TSchema, TResult> {
  return {
    input,
    run: async (parsed, caller) => run(parsed, caller),
  };
}

const none = v.optional(v.object({}));
const composition = v.object({ compositionId: idSchema });
const absolutePath = v.pipe(
  v.string(),
  v.minLength(1),
  v.check((value) => path.isAbsolute(value), "path must be absolute"),
);
const clipPlacement = v.object({
  compositionId: idSchema,
  name: v.optional(v.string()),
  start: v.optional(v.pipe(v.number(), v.minValue(0))),
  lane: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

/**
 * Everything the engine can do. The studio, the HTTP API, and MCP all call
 * these, so behavior and activity logging cannot drift between them. Inputs
 * are parsed here because remote callers reach this table over HTTP.
 */
export function createOperations(context: EngineContext) {
  const { store, events, queue, pool, loopbackUrl } = context;
  const record = (name: string, compositionId: string, detail?: ActivityDetail) =>
    logOperation(store, events, name, compositionId, detail);

  return {
    listCompositions: operation(none, async () => {
      const compositions = await store.list();
      return compositions.map((item) => ({ ...item, lease: store.leaseOf(item.id) }));
    }),

    workspaceStatus: operation(none, async () => {
      const compositions = await store.list();
      return {
        exports: queue.listJobs(),
        compositions: await Promise.all(
          compositions.map(async (item) => {
            const entries = await store.listActivity(item.id);
            return {
              compositionId: item.id,
              name: item.name,
              updatedAt: item.updatedAt,
              lease: store.leaseOf(item.id),
              lastActivity: entries.at(-1) ?? null,
            };
          }),
        ),
      };
    }),

    claimComposition: operation(
      v.object({
        compositionId: idSchema,
        holder: v.pipe(v.string(), v.minLength(1)),
        ttlSeconds: v.optional(v.number()),
      }),
      async ({ compositionId, holder, ttlSeconds }) => {
        await store.get(compositionId);
        return store.claim(compositionId, holder, ttlSeconds);
      },
    ),

    releaseComposition: operation(
      v.object({ compositionId: idSchema, holder: v.pipe(v.string(), v.minLength(1)) }),
      ({ compositionId, holder }) => {
        store.release(compositionId, holder);
        return { ok: true, compositionId };
      },
    ),

    reorderCompositions: operation(v.object({ ids: v.array(idSchema) }), ({ ids }) =>
      store.reorder(ids),
    ),

    getComposition: operation(composition, ({ compositionId }) => store.get(compositionId)),

    getActivity: operation(composition, ({ compositionId }) => store.listActivity(compositionId)),

    listExamples: operation(none, () => listExamples()),

    createComposition: operation(
      v.optional(
        v.object({
          name: v.optional(v.pipe(v.string(), v.minLength(1))),
          example: v.optional(v.string()),
        }),
      ),
      async (input) => {
        // SAFETY: writeExample performs the runtime unknown-example check for this user input.
        const created =
          input?.example !== undefined
            ? await writeExample(store, input.example as ExampleId)
            : await store.create(input?.name);
        if (input?.example !== undefined && input.name) {
          await store.updateSettings({ compositionId: created.id, name: input.name });
        }
        const result = await store.get(created.id);
        await record("create_composition", result.id, { name: result.name });
        return result;
      },
    ),

    duplicateComposition: operation(composition, async ({ compositionId }) => {
      const duplicate = await store.duplicate(compositionId);
      await record("create_composition", duplicate.id, { name: duplicate.name });
      return duplicate;
    }),

    updateSettings: operation(updateSettingsSchema, async (input) => {
      const updated = await store.updateSettings(input);
      await record("update_settings", updated.id, input);
      return updated;
    }),

    deleteComposition: operation(composition, async ({ compositionId }) => {
      await store.get(compositionId);
      await record("delete_composition", compositionId);
      await store.remove(compositionId);
      return { ok: true, compositionId };
    }),

    saveProject: operation(
      v.object({ compositionId: idSchema, path: absolutePath }),
      async ({ compositionId, path: destination }) => {
        const dest = ensureProjectArchiveExtension(destination);
        await store.saveProject(compositionId, dest, engineVersion, runtimeCatalog);
        return { path: dest };
      },
    ),

    importProject: operation(v.object({ path: absolutePath }), async ({ path: source }) => {
      const imported = await store.importProject(source, runtimeCatalog);
      await record("create_composition", imported.composition.id, {
        name: imported.composition.name,
      });
      return imported;
    }),

    checkLoopSeam: operation(composition, async ({ compositionId }) => {
      await store.get(compositionId);
      if (!context.thumbnails) throw new AppError("internal", "loop seam is not available");
      return { match: await context.thumbnails.compareLoopSeam(compositionId) };
    }),

    listFiles: operation(composition, ({ compositionId }) => store.listFiles(compositionId)),

    readFile: operation(readFileInputSchema, ({ compositionId, path: relativePath }) =>
      store.readFile(compositionId, relativePath),
    ),

    writeFile: operation(writeFileInputSchema, async (input) => {
      const file = await store.writeFile(
        input.compositionId,
        input.path,
        input.encoding,
        input.content,
        input.expectedEtag,
      );
      await record("write_file", input.compositionId, { path: input.path });
      return file;
    }),

    deleteFile: operation(readFileInputSchema, async ({ compositionId, path: relativePath }) => {
      await store.deleteFile(compositionId, relativePath);
      await record("delete_file", compositionId, { path: relativePath });
      return { ok: true, path: relativePath };
    }),

    /** Copies a file from anywhere on disk into assets/, renaming on collision. */
    importAsset: operation(
      v.object({ compositionId: idSchema, source: absolutePath }),
      async ({ compositionId, source }) => {
        await store.get(compositionId);
        if (!isAssetExtension(path.extname(source).slice(1).toLowerCase())) {
          throw new AppError("invalid_asset", "unsupported media extension");
        }
        const assetsDir = path.join(store.compositionDir(compositionId), "assets");
        let asset = path.basename(source).toLowerCase();
        if (await pathExists(path.join(assetsDir, asset))) {
          asset = `${createId("a")}-${asset}`;
        }
        const relativePath = path.posix.join("assets", asset);
        const bytes = await readBytes(source);
        await store.writeFile(compositionId, relativePath, "base64", bytes.toString("base64"), "");
        await record("write_file", compositionId, { path: relativePath });
        return { asset };
      },
    ),

    getMedia: operation(composition, ({ compositionId }) => store.getMedia(compositionId)),

    probeMedia: operation(probeMediaInputSchema, async ({ compositionId, asset }) => {
      await store.get(compositionId);
      return probeFile(
        resolveInside(path.join(store.compositionDir(compositionId), "assets"), asset),
      );
    }),

    createBlock: operation(clipPlacement, async ({ compositionId, name, start, lane }) => {
      const track = await store.createBlock(compositionId, name, start, lane);
      await record("put_track", compositionId, { trackId: track.id });
      return track;
    }),

    createMusicBlock: operation(clipPlacement, async ({ compositionId, name, start, lane }) => {
      const track = await store.createMusicBlock(compositionId, name, start, lane);
      await record("put_track", compositionId, { trackId: track.id });
      return track;
    }),

    putTrack: operation(
      v.object({ compositionId: idSchema, track: mediaTrackSchema }),
      async ({ compositionId, track }) => {
        const media = await store.putTrack(compositionId, track);
        await record("put_track", compositionId, { trackId: track.id });
        return media;
      },
    ),

    deleteTrack: operation(
      v.object({ compositionId: idSchema, trackId: idSchema }),
      async ({ compositionId, trackId }) => {
        const media = await store.deleteTrack(compositionId, trackId);
        await record("delete_track", compositionId, { trackId });
        return media;
      },
    ),

    putMarker: operation(
      v.object({ compositionId: idSchema, marker: markerSchema }),
      async ({ compositionId, marker }) => {
        const media = await store.putMarker(compositionId, marker);
        await record("put_marker", compositionId, { markerId: marker.id });
        return media;
      },
    ),

    deleteMarker: operation(
      v.object({ compositionId: idSchema, markerId: idSchema }),
      async ({ compositionId, markerId }) => {
        const media = await store.deleteMarker(compositionId, markerId);
        await record("delete_marker", compositionId, { markerId });
        return media;
      },
    ),

    listControls: operation(composition, ({ compositionId }) => store.getControls(compositionId)),

    putControl: operation(
      v.object({ compositionId: idSchema, control: controlSchema }),
      async ({ compositionId, control }) => {
        const document = await store.putControl(compositionId, control);
        await record("put_control", compositionId, { controlId: control.id });
        return document;
      },
    ),

    deleteControl: operation(
      v.object({ compositionId: idSchema, controlId: controlIdSchema }),
      async ({ compositionId, controlId }) => {
        const document = await store.deleteControl(compositionId, controlId);
        await record("delete_control", compositionId, { controlId });
        return document;
      },
    ),

    getRuntimeCatalog: operation(none, () => runtimeCatalog),

    getRuntimeTypes: operation(none, () => ({ types: getRuntimeTypes() })),

    validate: operation(composition, async ({ compositionId }, caller) => {
      const target = await store.get(compositionId);
      const media = await store.getMedia(compositionId);
      const report = await validateComposition(pool, target, media, loopbackUrl, caller.owner);
      await record("validate", compositionId, { ok: report.ok });
      return report;
    }),

    startExport: operation(startExportInputSchema, async (input, caller) => {
      const job = await queue.start(input, caller.owner);
      await record("start_export", input.compositionId, { jobId: job.id, format: job.format });
      return job;
    }),

    getExport: operation(v.object({ jobId: idSchema }), ({ jobId }) => queue.get(jobId)),

    cancelExport: operation(v.object({ jobId: idSchema }), async ({ jobId }) => {
      const job = queue.cancel(jobId);
      await record("cancel_export", job.compositionId, { jobId });
      return job;
    }),

    listExportJobs: operation(none, () => queue.listJobs()),

    listExports: operation(composition, ({ compositionId }) => listExports(store, compositionId)),

    /** The newest finished export file, with its absolute path. */
    newestExport: operation(composition, async ({ compositionId }) => {
      const newest = (await listExports(store, compositionId))[0];
      if (!newest) throw new AppError("not_found", "no exports exist");
      return {
        ...newest,
        path: path.join(store.compositionDir(compositionId), "exports", newest.fileName),
      };
    }),

    /** Copies a finished export out of the library. */
    copyExport: operation(
      v.object({ compositionId: idSchema, fileName: v.string(), destination: absolutePath }),
      async ({ compositionId, fileName, destination }) => {
        await store.get(compositionId);
        const exportsDir = path.join(store.compositionDir(compositionId), "exports");
        await copyFile(resolveInside(exportsDir, fileName), destination);
        return { path: destination };
      },
    ),
  };
}

export type Operations = ReturnType<typeof createOperations>;
export type OperationName = keyof Operations;
export type OperationInput<TName extends OperationName> = v.InferInput<Operations[TName]["input"]>;
export type OperationResult<TName extends OperationName> = Awaited<
  ReturnType<Operations[TName]["run"]>
>;

/** The engine as its callers see it, in this process or across HTTP. */
export type Engine = {
  call<TName extends OperationName>(
    name: TName,
    input?: OperationInput<TName>,
  ): Promise<OperationResult<TName>>;
};

export function isOperationName(operations: Operations, name: string): name is OperationName {
  return Object.hasOwn(operations, name);
}

/** Parses and runs one operation. The HTTP API and in-process engines both go through here. */
export async function runOperation<TName extends OperationName>(
  operations: Operations,
  name: TName,
  input: OperationInput<TName> | undefined,
  caller: Caller,
): Promise<OperationResult<TName>> {
  const selected: Operation<v.GenericSchema, OperationResult<OperationName>> = operations[name];
  const result = await selected.run(v.parse(selected.input, input), caller);
  // SAFETY: operations[name] is the operation called `name`, so its result is
  // that operation's; the generic index only widens it to every result.
  return result as OperationResult<TName>;
}

export function localEngine(operations: Operations, caller: Caller): Engine {
  return {
    call: (name, input) => runOperation(operations, name, input, caller),
  };
}

export { engineVersion };
