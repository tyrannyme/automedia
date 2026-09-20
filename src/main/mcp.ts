import { McpServer } from "@modelcontextprotocol/server";
import * as v from "valibot";
import * as z from "zod/v4";
import { compositionIdPattern, controlIdPattern, hexColorPattern } from "@shared/ids.ts";
import { exportFormats } from "@shared/limits.ts";
import { toErrorObject } from "@shared/errors.ts";
import {
  controlSchema,
  markerSchema,
  mediaTrackSchema,
  startExportInputSchema,
  updateSettingsSchema,
  writeFileInputSchema,
  type Control,
  type Marker,
  type MediaTrack,
  type StartExportInput,
  type UpdateSettingsInput,
  type WriteFileInput,
} from "@shared/schemas.ts";
import { app } from "electron";
import { getRuntimeTypes, runtimeCatalog } from "./runtime.ts";
import { ffmpegHealth } from "./ffmpeg.ts";
import { probeFile } from "./probe.ts";
import path from "node:path";
import type { EventBus } from "./events.ts";
import { logOperation } from "./activity.ts";
import type { ExportQueue } from "./export.ts";
import { validateComposition, type LoopbackUrlSource } from "./validate.ts";
import type { CompositionStore } from "./store.ts";
import { resolveInside } from "./fs.ts";
import { listExamples, writeExample, type ExampleId } from "./examples/index.ts";
import { ensureProjectArchiveExtension } from "@shared/project-archive.ts";

const zId = z.string().regex(compositionIdPattern);
const zControlId = z.string().regex(controlIdPattern);
const zTrack = z.object({
  id: zId,
  kind: z.enum(["audio", "video", "image", "block", "music"]),
  asset: z.string().min(1),
  name: z.string().min(1).optional(),
  color: z.string().regex(hexColorPattern).optional(),
  start: z.number().min(0),
  duration: z.number().gt(0),
  trimStart: z.number().min(0),
  rate: z.number().min(0.25).max(4),
  volume: z.number().min(0).max(1),
  mute: z.boolean(),
  lane: z.number().int().min(0),
});
const zMarker = z.object({
  id: zId,
  timeSeconds: z.number().min(0),
  label: z.string(),
});
const zControl = z.union([
  z.object({
    id: zControlId,
    type: z.literal("range"),
    label: z.string(),
    value: z.number(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
  }),
  z.object({
    id: zControlId,
    type: z.literal("color"),
    label: z.string(),
    value: z.string(),
  }),
  z.object({
    id: zControlId,
    type: z.literal("toggle"),
    label: z.string(),
    value: z.boolean(),
  }),
  z.object({
    id: zControlId,
    type: z.literal("select"),
    label: z.string(),
    value: z.string(),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .min(1)
      .max(20),
  }),
]);

function toolResult<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function toolError(error: Error) {
  const object = toErrorObject(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(object) }],
    structuredContent: object,
  };
}

function withTool<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  return async (args: TArgs) => {
    try {
      return toolResult(await run(args));
    } catch (error) {
      return toolError(error instanceof Error ? error : new Error("Unexpected error"));
    }
  };
}

export function createMcpServer(options: {
  store: CompositionStore;
  exports: ExportQueue;
  events: EventBus;
  loopbackUrl?: LoopbackUrlSource;
}): McpServer {
  const { store, exports: queue, events, loopbackUrl } = options;
  const server = new McpServer({
    name: "automedia",
    version: "0.1.0",
  });

  const log = (
    operation: string,
    compositionId: string,
    detail?: import("./events.ts").ActivityDetail,
  ): Promise<void> => logOperation(store, events, operation, compositionId, detail);

  server.registerTool(
    "list_compositions",
    {
      description:
        "List compositions in sidebar order. Each row includes a lease when another agent claimed it.",
      inputSchema: z.object({}),
    },
    withTool(async () => {
      const compositions = await store.list();
      return compositions.map((composition) => ({
        ...composition,
        lease: store.leaseOf(composition.id),
      }));
    }),
  );

  server.registerTool(
    "workspace_status",
    {
      description:
        "See ffmpeg health, queued exports, and composition leases before starting parallel work. Claim a composition if you will write.",
      inputSchema: z.object({}),
    },
    withTool(async () => {
      const compositions = await store.list();
      const activity = await Promise.all(
        compositions.map(async (composition) => {
          const entries = await store.listActivity(composition.id);
          return {
            compositionId: composition.id,
            name: composition.name,
            updatedAt: composition.updatedAt,
            lease: store.leaseOf(composition.id),
            lastActivity: entries.at(-1) ?? null,
          };
        }),
      );
      return {
        ffmpeg: await ffmpegHealth(),
        exports: queue.listJobs(),
        compositions: activity,
      };
    }),
  );

  server.registerTool(
    "claim_composition",
    {
      description:
        "Claim a composition so parallel agents do not write the same project. Pass a stable holder name. Renew by claiming again. Release when finished.",
      inputSchema: z.object({
        compositionId: zId,
        holder: z.string().min(1),
        ttlSeconds: z.number().optional(),
      }),
    },
    withTool(
      async ({
        compositionId,
        holder,
        ttlSeconds,
      }: {
        compositionId: string;
        holder: string;
        ttlSeconds?: number | undefined;
      }) => {
        await store.get(compositionId);
        return store.claim(compositionId, holder, ttlSeconds);
      },
    ),
  );

  server.registerTool(
    "release_composition",
    {
      description: "Release a composition claim you hold.",
      inputSchema: z.object({ compositionId: zId, holder: z.string().min(1).max(80) }),
    },
    withTool(async ({ compositionId, holder }: { compositionId: string; holder: string }) => {
      store.release(compositionId, holder);
      return { ok: true, compositionId };
    }),
  );

  server.registerTool(
    "reorder_compositions",
    {
      description:
        "Set the sidebar project order. Unknown ids are ignored; missing ids stay at the end.",
      inputSchema: z.object({ ids: z.array(zId).min(1) }),
    },
    withTool(async ({ ids }: { ids: string[] }) => store.reorder(ids)),
  );

  server.registerTool(
    "get_composition",
    {
      description: "Get one composition manifest.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => store.get(compositionId)),
  );

  server.registerTool(
    "get_activity",
    {
      description:
        "Read the composition activity log. Each line is an authoring or export operation.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => ({
      entries: await store.listActivity(compositionId),
    })),
  );

  server.registerTool(
    "list_examples",
    {
      description:
        "Named composition examples the app can create. Pass an id as example to create_composition.",
      inputSchema: z.object({}),
    },
    withTool(async () => listExamples()),
  );

  server.registerTool(
    "create_composition",
    {
      description: "Create a composition directory with default HTML, CSS, JS, and documents.",
      inputSchema: z.object({
        name: z.string().optional(),
        example: z.string().optional(),
      }),
    },
    withTool(
      async ({ name, example }: { name?: string | undefined; example?: string | undefined }) => {
        // SAFETY: writeExample performs the runtime unknown-example check for this user input.
        const composition =
          example !== undefined
            ? await writeExample(store, example as ExampleId)
            : await store.create(name);
        if (example !== undefined && name) {
          await store.updateSettings({ compositionId: composition.id, name });
        }
        const result = await store.get(composition.id);
        await log("create_composition", composition.id, { name: result.name });
        return result;
      },
    ),
  );

  server.registerTool(
    "update_settings",
    {
      description:
        "Update composition name, size, fps, or background. Duration follows the last clip out point.",
      inputSchema: z.object({
        compositionId: zId,
        name: z.string().min(1).optional(),
        width: z.number().int().min(1).max(16384).optional(),
        height: z.number().int().min(1).max(16384).optional(),
        fps: z.number().int().min(1).max(240).optional(),
        durationSeconds: z.number().gt(0).max(3600).optional(),
        background: z.string().optional(),
      }),
    },
    withTool(async (input: UpdateSettingsInput) => {
      const settings = v.parse(updateSettingsSchema, input);
      const composition = await store.updateSettings(settings);
      await log("update_settings", composition.id, settings);
      return composition;
    }),
  );

  server.registerTool(
    "delete_composition",
    {
      description: "Move a composition directory into .trash.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => {
      await store.get(compositionId);
      await log("delete_composition", compositionId);
      await store.remove(compositionId);
      return { ok: true, compositionId };
    }),
  );

  server.registerTool(
    "save_project",
    {
      description:
        "Write a shareable .automedia snapshot of a composition to a filesystem path. Authored files and the thumbnail go in; exports and activity logs do not. Always a copy, not the live project.",
      inputSchema: z.object({ compositionId: zId, path: z.string().min(1) }),
    },
    withTool(async ({ compositionId, path: destPath }: { compositionId: string; path: string }) => {
      const dest = ensureProjectArchiveExtension(path.resolve(destPath));
      await store.saveProject(compositionId, dest, app.getVersion?.() ?? "0.1.0", runtimeCatalog);
      return { path: dest };
    }),
  );

  server.registerTool(
    "import_project",
    {
      description:
        "Import a .automedia snapshot as a new composition in the library. Always creates a copy with a new id.",
      inputSchema: z.object({ path: z.string().min(1) }),
    },
    withTool(async ({ path: archivePath }: { path: string }) => {
      const imported = await store.importProject(path.resolve(archivePath), runtimeCatalog);
      await log("create_composition", imported.composition.id, {
        name: imported.composition.name,
      });
      return imported;
    }),
  );

  server.registerTool(
    "list_files",
    {
      description: "List composition files as paths relative to the composition directory.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => ({
      files: await store.listFiles(compositionId),
    })),
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a composition file. Use the returned etag with write_file.",
      inputSchema: z.object({ compositionId: zId, path: z.string() }),
    },
    withTool(
      async ({ compositionId, path: relativePath }: { compositionId: string; path: string }) =>
        store.readFile(compositionId, relativePath),
    ),
  );

  server.registerTool(
    "write_file",
    {
      description:
        "Write a composition file as utf8 or base64. expectedEtag must match the last read; use an empty string to create.",
      inputSchema: z.object({
        compositionId: zId,
        path: z.string(),
        encoding: z.enum(["utf8", "base64"]),
        content: z.string(),
        expectedEtag: z.string(),
      }),
    },
    withTool(async (input: WriteFileInput) => {
      const parsed = v.parse(writeFileInputSchema, input);
      const file = await store.writeFile(
        parsed.compositionId,
        parsed.path,
        parsed.encoding,
        parsed.content,
        parsed.expectedEtag,
      );
      await log("write_file", parsed.compositionId, { path: parsed.path });
      return file;
    }),
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a composition file. composition.json cannot be deleted.",
      inputSchema: z.object({ compositionId: zId, path: z.string() }),
    },
    withTool(
      async ({ compositionId, path: relativePath }: { compositionId: string; path: string }) => {
        await store.deleteFile(compositionId, relativePath);
        await log("delete_file", compositionId, { path: relativePath });
        return { ok: true, path: relativePath };
      },
    ),
  );

  server.registerTool(
    "get_media",
    {
      description: "Get the media document for a composition.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => store.getMedia(compositionId)),
  );

  server.registerTool(
    "probe_media",
    {
      description: "Run ffprobe on an asset under assets/ before putting a track.",
      inputSchema: z.object({ compositionId: zId, asset: z.string() }),
    },
    withTool(async ({ compositionId, asset }: { compositionId: string; asset: string }) => {
      await store.get(compositionId);
      const filePath = resolveInside(
        path.join(store.compositionDir(compositionId), "assets"),
        asset,
      );
      return probeFile(filePath);
    }),
  );

  server.registerTool(
    "create_block",
    {
      description:
        "Add an HTML/CSS/JS block to the timeline. Defaults to the first compatible lane without overlapping existing clips. Pass lane to choose a track, including a new one.",
      inputSchema: z.object({
        compositionId: zId,
        name: z.string().optional(),
        start: z.number().min(0).optional(),
        lane: z.number().int().min(0).optional(),
      }),
    },
    withTool(
      async ({
        compositionId,
        name,
        start,
        lane,
      }: {
        compositionId: string;
        name?: string | undefined;
        start?: number | undefined;
        lane?: number | undefined;
      }) => {
        const track = await store.createBlock(compositionId, name, start, lane);
        await log("put_track", compositionId, { trackId: track.id });
        return track;
      },
    ),
  );

  server.registerTool(
    "create_music_block",
    {
      description:
        "Add a music clip to the timeline. Authors write a Strudel pattern in music/<asset>/pattern.js. The runtime wrapper, playback, mute, and volume are managed. Defaults to the first compatible lane without overlapping existing clips. Unmuted so the pattern can be heard. Pass lane to choose a track, including a new one.",
      inputSchema: z.object({
        compositionId: zId,
        name: z.string().optional(),
        start: z.number().min(0).optional(),
        lane: z.number().int().min(0).optional(),
      }),
    },
    withTool(
      async ({
        compositionId,
        name,
        start,
        lane,
      }: {
        compositionId: string;
        name?: string | undefined;
        start?: number | undefined;
        lane?: number | undefined;
      }) => {
        const track = await store.createMusicBlock(compositionId, name, start, lane);
        await log("put_track", compositionId, { trackId: track.id });
        return track;
      },
    ),
  );

  server.registerTool(
    "put_track",
    {
      description:
        "Create or replace a typed audio, video, image, block, or music track. Asset tracks must exist under assets/; visual blocks under blocks/; music clips under music/ with pattern.js. Image tracks are muted stills with an authored duration.",
      inputSchema: z.object({ compositionId: zId, track: zTrack }),
    },
    withTool(async ({ compositionId, track }: { compositionId: string; track: MediaTrack }) => {
      const parsed = v.parse(mediaTrackSchema, track);
      const media = await store.putTrack(compositionId, parsed);
      await log("put_track", compositionId, { trackId: parsed.id });
      return media;
    }),
  );

  server.registerTool(
    "delete_track",
    {
      description: "Remove a media track.",
      inputSchema: z.object({ compositionId: zId, trackId: zId }),
    },
    withTool(async ({ compositionId, trackId }: { compositionId: string; trackId: string }) => {
      const media = await store.deleteTrack(compositionId, trackId);
      await log("delete_track", compositionId, { trackId });
      return media;
    }),
  );

  server.registerTool(
    "put_marker",
    {
      description: "Create or replace a timeline marker.",
      inputSchema: z.object({ compositionId: zId, marker: zMarker }),
    },
    withTool(async ({ compositionId, marker }: { compositionId: string; marker: Marker }) => {
      const parsed = v.parse(markerSchema, marker);
      const media = await store.putMarker(compositionId, parsed);
      await log("put_marker", compositionId, { markerId: parsed.id });
      return media;
    }),
  );

  server.registerTool(
    "delete_marker",
    {
      description: "Remove a timeline marker.",
      inputSchema: z.object({ compositionId: zId, markerId: zId }),
    },
    withTool(async ({ compositionId, markerId }: { compositionId: string; markerId: string }) => {
      const media = await store.deleteMarker(compositionId, markerId);
      await log("delete_marker", compositionId, { markerId });
      return media;
    }),
  );

  server.registerTool(
    "list_controls",
    {
      description: "List composition controls.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) =>
      store.getControls(compositionId),
    ),
  );

  server.registerTool(
    "put_control",
    {
      description: "Create or replace a range, color, toggle, or select control.",
      inputSchema: z.object({ compositionId: zId, control: zControl }),
    },
    withTool(async ({ compositionId, control }: { compositionId: string; control: Control }) => {
      const parsed = v.parse(controlSchema, control);
      const document = await store.putControl(compositionId, parsed);
      await log("put_control", compositionId, { controlId: parsed.id });
      return document;
    }),
  );

  server.registerTool(
    "delete_control",
    {
      description: "Remove a control.",
      inputSchema: z.object({ compositionId: zId, controlId: zId }),
    },
    withTool(async ({ compositionId, controlId }: { compositionId: string; controlId: string }) => {
      const document = await store.deleteControl(compositionId, controlId);
      await log("delete_control", compositionId, { controlId });
      return document;
    }),
  );

  server.registerTool(
    "get_health",
    {
      description: "Check whether ffmpeg and ffprobe are installed and on PATH.",
      inputSchema: z.object({}),
    },
    withTool(async () => ffmpegHealth()),
  );

  server.registerTool(
    "get_runtime_catalog",
    {
      description: "Pinned composition-runtime library versions served through the import map.",
      inputSchema: z.object({}),
    },
    withTool(async () => runtimeCatalog),
  );

  server.registerTool(
    "get_runtime_types",
    {
      description: "TypeScript contract for window.automedia.",
      inputSchema: z.object({}),
    },
    withTool(async () => ({ types: getRuntimeTypes() })),
  );

  server.registerTool(
    "validate",
    {
      description: "Load the composition in headless Chromium and report runtime issues.",
      inputSchema: z.object({ compositionId: zId }),
    },
    withTool(async ({ compositionId }: { compositionId: string }) => {
      const composition = await store.get(compositionId);
      const media = await store.getMedia(compositionId);
      const report = await validateComposition(composition, media, loopbackUrl);
      await log("validate", compositionId, { ok: report.ok });
      return report;
    }),
  );

  server.registerTool(
    "start_export",
    {
      description:
        "Queue a PNG, GIF, WebP, MP4, WebM, MP3, WAV, or OGG export. Validate must pass. Jobs wait in line; one runs at a time. A successful job includes contentUrl. Everything except PNG needs a healthy ffmpeg. Audio formats need an unmuted audio, video, or music track.",
      inputSchema: z.object({
        compositionId: zId,
        format: z.enum(exportFormats),
        quality: z.number().int().min(1).max(100).optional(),
        timeSeconds: z.number().min(0).optional(),
      }),
    },
    withTool(async (input: StartExportInput) => {
      const job = await queue.start(v.parse(startExportInputSchema, input));
      await log("start_export", input.compositionId, { jobId: job.id, format: job.format });
      return job;
    }),
  );

  server.registerTool(
    "get_export",
    {
      description: "Poll an export job. A completed job includes contentUrl.",
      inputSchema: z.object({ jobId: zId }),
    },
    withTool(async ({ jobId }: { jobId: string }) => queue.get(jobId)),
  );

  server.registerTool(
    "cancel_export",
    {
      description: "Cancel a running export. No finished file is left behind.",
      inputSchema: z.object({ jobId: zId }),
    },
    withTool(async ({ jobId }: { jobId: string }) => {
      const job = queue.cancel(jobId);
      await log("cancel_export", job.compositionId, { jobId });
      return job;
    }),
  );

  return server;
}
