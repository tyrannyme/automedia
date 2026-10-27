import path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { compositionIdPattern, controlIdPattern, hexColorPattern } from "@shared/ids.ts";
import { exportFormats } from "@shared/limits.ts";
import { toErrorObject } from "@shared/errors.ts";
import type {
  Control,
  Marker,
  MediaTrack,
  StartExportInput,
  UpdateSettingsInput,
  WriteFileInput,
} from "@shared/schemas.ts";
import type { Engine } from "./operations.ts";
import { engineVersion } from "./version.ts";

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

/**
 * Results name compositions `compositionId` and exports `jobId`, as the
 * inputs do, so an agent can pass a result's fields straight back.
 */
function agentComposition<T extends { id: string }>({ id, ...rest }: T) {
  return { compositionId: id, ...rest };
}

function agentJob<T extends { id: string }>({ id, ...rest }: T) {
  return { jobId: id, ...rest };
}

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

/** The HTTP request a tool call arrived on, when it came over HTTP. */
type ToolContext = { http?: { req?: Request | undefined } | undefined };

/** Tools whose input schema is an empty object. */
type NoArgs = Record<string, never>;

/** Picks the engine for one tool call; over HTTP the request names its owner. */
export type EngineFor = (request: Request | undefined) => Engine;

export function createMcpServer(engineFor: EngineFor): McpServer {
  const server = new McpServer({ name: "automedia", version: engineVersion });

  function tool<TArgs, TResult>(run: (args: TArgs, engine: Engine) => Promise<TResult>) {
    return async (args: TArgs, context: ToolContext) => {
      try {
        return toolResult(await run(args, engineFor(context.http?.req)));
      } catch (error) {
        return toolError(error instanceof Error ? error : new Error("Unexpected error"));
      }
    };
  }

  type CompositionArgs = { compositionId: string };
  type PlacementArgs = {
    compositionId: string;
    name?: string | undefined;
    start?: number | undefined;
    lane?: number | undefined;
  };

  server.registerTool(
    "list_compositions",
    {
      description:
        "List compositions in sidebar order. Each row includes a lease when another agent claimed it.",
      inputSchema: z.object({}),
    },
    tool(async (_args: NoArgs, engine) =>
      (await engine.call("listCompositions")).map(agentComposition),
    ),
  );

  server.registerTool(
    "workspace_status",
    {
      description:
        "See queued exports and composition leases before starting parallel work. Claim a composition if you will write. Pass compositionId to see only that composition and its exports.",
      inputSchema: z.object({ compositionId: zId.optional() }),
    },
    tool(async (args: { compositionId?: string | undefined }, engine) => {
      const status = await engine.call("workspaceStatus", args);
      return { ...status, exports: status.exports.map(agentJob) };
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
    tool(
      (args: { compositionId: string; holder: string; ttlSeconds?: number | undefined }, engine) =>
        engine.call("claimComposition", args),
    ),
  );

  server.registerTool(
    "release_composition",
    {
      description: "Release a composition claim you hold.",
      inputSchema: z.object({ compositionId: zId, holder: z.string().min(1).max(80) }),
    },
    tool((args: { compositionId: string; holder: string }, engine) =>
      engine.call("releaseComposition", args),
    ),
  );

  server.registerTool(
    "reorder_compositions",
    {
      description:
        "Set the sidebar project order. Unknown compositionIds are ignored; missing ones stay at the end.",
      inputSchema: z.object({ compositionIds: z.array(zId).min(1) }),
    },
    tool(async (args: { compositionIds: string[] }, engine) =>
      (await engine.call("reorderCompositions", { ids: args.compositionIds })).map(
        agentComposition,
      ),
    ),
  );

  server.registerTool(
    "get_composition",
    {
      description: "Get one composition manifest.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool(async (args: CompositionArgs, engine) =>
      agentComposition(await engine.call("getComposition", args)),
    ),
  );

  server.registerTool(
    "get_activity",
    {
      description:
        "Read the composition activity log. Each line is an authoring or export operation.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool(async (args: CompositionArgs, engine) => ({
      entries: await engine.call("getActivity", args),
    })),
  );

  server.registerTool(
    "list_examples",
    {
      description:
        "Named composition examples the app can create. Pass an id as example to create_composition.",
      inputSchema: z.object({}),
    },
    tool((_args: NoArgs, engine) => engine.call("listExamples")),
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
    tool(async (args: { name?: string | undefined; example?: string | undefined }, engine) =>
      agentComposition(await engine.call("createComposition", args)),
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
    tool(async (args: UpdateSettingsInput, engine) =>
      agentComposition(await engine.call("updateSettings", args)),
    ),
  );

  server.registerTool(
    "delete_composition",
    {
      description: "Move a composition directory into .trash.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool((args: CompositionArgs, engine) => engine.call("deleteComposition", args)),
  );

  server.registerTool(
    "save_project",
    {
      description:
        "Write a shareable .automedia snapshot of a composition to a filesystem path. Authored files and the thumbnail go in; exports and activity logs do not. Always a copy, not the live project.",
      inputSchema: z.object({ compositionId: zId, path: z.string().min(1) }),
    },
    // Relative paths resolve against the caller's directory, which for a
    // stdio agent is this process, not the engine.
    tool((args: { compositionId: string; path: string }, engine) =>
      engine.call("saveProject", { ...args, path: path.resolve(args.path) }),
    ),
  );

  server.registerTool(
    "import_project",
    {
      description:
        "Import a .automedia snapshot as a new composition in the library. Always creates a copy with a new id.",
      inputSchema: z.object({ path: z.string().min(1) }),
    },
    tool(async (args: { path: string }, engine) => {
      const imported = await engine.call("importProject", { path: path.resolve(args.path) });
      return { ...imported, composition: agentComposition(imported.composition) };
    }),
  );

  server.registerTool(
    "import_asset",
    {
      description:
        "Copy an image, font, text (.txt, such as a font licence), audio, or video file from a filesystem path into the composition's assets/. Returns the asset name, renamed if one already exists. Blocks reference it as ../../assets/<asset>.",
      inputSchema: z.object({ compositionId: zId, path: z.string().min(1) }),
    },
    tool((args: { compositionId: string; path: string }, engine) =>
      engine.call("importAsset", {
        compositionId: args.compositionId,
        source: path.resolve(args.path),
      }),
    ),
  );

  server.registerTool(
    "list_files",
    {
      description: "List composition files as paths relative to the composition directory.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool(async (args: CompositionArgs, engine) => ({
      files: await engine.call("listFiles", args),
    })),
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a composition file. Use the returned etag with write_file.",
      inputSchema: z.object({ compositionId: zId, path: z.string() }),
    },
    tool((args: { compositionId: string; path: string }, engine) => engine.call("readFile", args)),
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
    tool((args: WriteFileInput, engine) => engine.call("writeFile", args)),
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a composition file. composition.json cannot be deleted.",
      inputSchema: z.object({ compositionId: zId, path: z.string() }),
    },
    tool((args: { compositionId: string; path: string }, engine) =>
      engine.call("deleteFile", args),
    ),
  );

  server.registerTool(
    "get_media",
    {
      description: "Get the media document for a composition.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool((args: CompositionArgs, engine) => engine.call("getMedia", args)),
  );

  server.registerTool(
    "probe_media",
    {
      description:
        "Probe an asset under assets/ for its container, streams, codecs, duration, size, and frame rate before putting a track.",
      inputSchema: z.object({ compositionId: zId, asset: z.string() }),
    },
    tool((args: { compositionId: string; asset: string }, engine) =>
      engine.call("probeMedia", args),
    ),
  );

  server.registerTool(
    "create_block",
    {
      description:
        "Add an HTML/CSS/JS block to the timeline. Defaults to the first compatible lane without overlapping existing clips. Pass lane to choose a track, including a new one. Blocks load Tailwind's Preflight reset, except that img and video keep any width they are given, even past their container: add max-w-full to cap one.",
      inputSchema: z.object({
        compositionId: zId,
        name: z.string().optional(),
        start: z.number().min(0).optional(),
        lane: z.number().int().min(0).optional(),
      }),
    },
    tool((args: PlacementArgs, engine) => engine.call("createBlock", args)),
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
    tool((args: PlacementArgs, engine) => engine.call("createMusicBlock", args)),
  );

  server.registerTool(
    "put_track",
    {
      description:
        "Create or replace a typed audio, video, image, block, or music track. Asset tracks must exist under assets/; visual blocks under blocks/; music clips under music/ with pattern.js. Image tracks are muted stills with an authored duration.",
      inputSchema: z.object({ compositionId: zId, track: zTrack }),
    },
    tool((args: { compositionId: string; track: MediaTrack }, engine) =>
      engine.call("putTrack", args),
    ),
  );

  server.registerTool(
    "delete_track",
    {
      description: "Remove a media track.",
      inputSchema: z.object({ compositionId: zId, trackId: zId }),
    },
    tool((args: { compositionId: string; trackId: string }, engine) =>
      engine.call("deleteTrack", args),
    ),
  );

  server.registerTool(
    "put_marker",
    {
      description: "Create or replace a timeline marker.",
      inputSchema: z.object({ compositionId: zId, marker: zMarker }),
    },
    tool((args: { compositionId: string; marker: Marker }, engine) =>
      engine.call("putMarker", args),
    ),
  );

  server.registerTool(
    "delete_marker",
    {
      description: "Remove a timeline marker.",
      inputSchema: z.object({ compositionId: zId, markerId: zId }),
    },
    tool((args: { compositionId: string; markerId: string }, engine) =>
      engine.call("deleteMarker", args),
    ),
  );

  server.registerTool(
    "list_controls",
    {
      description: "List composition controls.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool((args: CompositionArgs, engine) => engine.call("listControls", args)),
  );

  server.registerTool(
    "put_control",
    {
      description: "Create or replace a range, color, toggle, or select control.",
      inputSchema: z.object({ compositionId: zId, control: zControl }),
    },
    tool((args: { compositionId: string; control: Control }, engine) =>
      engine.call("putControl", args),
    ),
  );

  server.registerTool(
    "delete_control",
    {
      description: "Remove a control.",
      inputSchema: z.object({ compositionId: zId, controlId: zControlId }),
    },
    tool((args: { compositionId: string; controlId: string }, engine) =>
      engine.call("deleteControl", args),
    ),
  );

  server.registerTool(
    "get_runtime_catalog",
    {
      description: "Pinned composition-runtime library versions served through the import map.",
      inputSchema: z.object({}),
    },
    tool((_args: NoArgs, engine) => engine.call("getRuntimeCatalog")),
  );

  server.registerTool(
    "get_runtime_types",
    {
      description: "TypeScript contract for window.automedia.",
      inputSchema: z.object({}),
    },
    tool((_args: NoArgs, engine) => engine.call("getRuntimeTypes")),
  );

  server.registerTool(
    "validate",
    {
      description:
        "Load the composition in headless Chromium, seek to the start of every clip once its fonts load, and report runtime issues: uncaught errors and rejected promises from scripts and renderers, and failed resources.",
      inputSchema: z.object({ compositionId: zId }),
    },
    tool((args: CompositionArgs, engine) => engine.call("validate", args)),
  );

  server.registerTool(
    "start_export",
    {
      description:
        "Queue a PNG, GIF, WebP, MP4, WebM, MP3, WAV, or OGG export. Validate must pass. Jobs from all agents share a few export slots, taken from each agent in turn. A successful job includes contentUrl and outputPath. Pass path to also save the finished file there. Audio formats need an unmuted audio, video, or music track.",
      inputSchema: z.object({
        compositionId: zId,
        format: z.enum(exportFormats),
        quality: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("WebP, MP4, WebM, MP3, and OGG only."),
        timeSeconds: z.number().min(0).optional().describe("PNG only: the time to capture."),
        path: z
          .string()
          .min(1)
          .optional()
          .describe("A file path to save the finished export to, as well as exports/."),
      }),
    },
    // Relative paths resolve against the caller's directory, like save_project.
    tool(async (args: StartExportInput, engine) => {
      const input = { ...args };
      if (args.path !== undefined) input.path = path.resolve(args.path);
      return agentJob(await engine.call("startExport", input));
    }),
  );

  server.registerTool(
    "get_export",
    {
      description:
        "Poll an export job. While a GIF, WebP, MP4, or WebM job is capturing, frame counts the frames captured of frames. A completed job includes contentUrl, and path when start_export was given one.",
      inputSchema: z.object({ jobId: zId }),
    },
    tool(async (args: { jobId: string }, engine) => agentJob(await engine.call("getExport", args))),
  );

  server.registerTool(
    "cancel_export",
    {
      description: "Cancel a running export. No finished file is left behind.",
      inputSchema: z.object({ jobId: zId }),
    },
    tool(async (args: { jobId: string }, engine) =>
      agentJob(await engine.call("cancelExport", args)),
    ),
  );

  return server;
}
