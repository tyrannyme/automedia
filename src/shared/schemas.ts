import * as v from "valibot";
import { compositionIdPattern, controlIdPattern, hexColorPattern } from "./ids.ts";
import { exportFormats, limits, mediaExtensions } from "./limits.ts";

export const idSchema = v.pipe(v.string(), v.regex(compositionIdPattern));
export const controlIdSchema = v.pipe(v.string(), v.regex(controlIdPattern));
export const hexColorSchema = v.pipe(v.string(), v.regex(hexColorPattern));
export const backgroundSchema = v.union([v.literal("transparent"), hexColorSchema]);

export const compositionSchema = v.object({
  version: v.literal(3),
  id: idSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  width: v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  height: v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  fps: v.pipe(v.number(), v.integer(), v.minValue(limits.minFps), v.maxValue(limits.maxFps)),
  durationSeconds: v.pipe(v.number(), v.gtValue(0), v.maxValue(limits.maxDurationSeconds)),
  background: backgroundSchema,
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const legacyCompositionSchema = v.object({
  version: v.literal(2),
  id: idSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  entry: v.optional(v.string()),
  width: v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  height: v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  fps: v.pipe(v.number(), v.integer(), v.minValue(limits.minFps), v.maxValue(limits.maxFps)),
  durationSeconds: v.pipe(v.number(), v.gtValue(0), v.maxValue(limits.maxDurationSeconds)),
  background: backgroundSchema,
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const updateSettingsSchema = v.object({
  compositionId: idSchema,
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  width: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  ),
  height: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(limits.minSize), v.maxValue(limits.maxSize)),
  ),
  fps: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(limits.minFps), v.maxValue(limits.maxFps)),
  ),
  durationSeconds: v.optional(
    v.pipe(v.number(), v.gtValue(0), v.maxValue(limits.maxDurationSeconds)),
  ),
  background: v.optional(backgroundSchema),
});

export const trackKindSchema = v.picklist(["audio", "video", "image", "block", "music"]);

export const mediaTrackSchema = v.object({
  id: idSchema,
  kind: trackKindSchema,
  asset: v.pipe(v.string(), v.minLength(1)),
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  color: v.optional(hexColorSchema),
  start: v.pipe(v.number(), v.minValue(0)),
  duration: v.pipe(v.number(), v.gtValue(0)),
  trimStart: v.pipe(v.number(), v.minValue(0)),
  rate: v.pipe(v.number(), v.minValue(limits.minRate), v.maxValue(limits.maxRate)),
  volume: v.pipe(v.number(), v.minValue(limits.minVolume), v.maxValue(limits.maxVolume)),
  mute: v.boolean(),
  lane: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const markerSchema = v.object({
  id: idSchema,
  timeSeconds: v.pipe(v.number(), v.minValue(0)),
  label: v.string(),
});

export const mediaDocumentSchema = v.object({
  tracks: v.pipe(v.array(mediaTrackSchema), v.maxLength(limits.maxTracks)),
  markers: v.pipe(v.array(markerSchema), v.maxLength(limits.maxMarkers)),
});

export const rangeControlSchema = v.object({
  id: controlIdSchema,
  type: v.literal("range"),
  label: v.string(),
  value: v.number(),
  min: v.number(),
  max: v.number(),
  step: v.number(),
});

export const colorControlSchema = v.object({
  id: controlIdSchema,
  type: v.literal("color"),
  label: v.string(),
  value: hexColorSchema,
});

export const toggleControlSchema = v.object({
  id: controlIdSchema,
  type: v.literal("toggle"),
  label: v.string(),
  value: v.boolean(),
});

export const selectControlSchema = v.object({
  id: controlIdSchema,
  type: v.literal("select"),
  label: v.string(),
  value: v.string(),
  options: v.pipe(
    v.array(v.object({ value: v.string(), label: v.string() })),
    v.minLength(1),
    v.maxLength(limits.maxSelectOptions),
  ),
});

export const controlSchema = v.union([
  rangeControlSchema,
  colorControlSchema,
  toggleControlSchema,
  selectControlSchema,
]);

export const controlsDocumentSchema = v.object({
  controls: v.pipe(v.array(controlSchema), v.maxLength(limits.maxControls)),
});

export const encodingSchema = v.picklist(["utf8", "base64"]);
export const exportFormatSchema = v.picklist(exportFormats);
export const mediaExtensionSchema = v.picklist(mediaExtensions);

export const writeFileInputSchema = v.object({
  compositionId: idSchema,
  path: v.string(),
  encoding: encodingSchema,
  content: v.string(),
  expectedEtag: v.string(),
});

export const readFileInputSchema = v.object({
  compositionId: idSchema,
  path: v.string(),
});

export const probeMediaInputSchema = v.object({
  compositionId: idSchema,
  asset: v.string(),
});

const exportQualitySchema = v.optional(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
);
const exportTimeSchema = v.optional(v.pipe(v.number(), v.minValue(0)));
const exportBaseEntries = { compositionId: idSchema };

export const startExportInputSchema = v.union([
  v.strictObject({ ...exportBaseEntries, format: v.literal("png"), timeSeconds: exportTimeSchema }),
  v.strictObject({ ...exportBaseEntries, format: v.literal("gif") }),
  v.strictObject({
    ...exportBaseEntries,
    format: v.literal("webp"),
    quality: exportQualitySchema,
  }),
  v.strictObject({
    ...exportBaseEntries,
    format: v.literal("mp4"),
    quality: exportQualitySchema,
  }),
  v.strictObject({
    ...exportBaseEntries,
    format: v.literal("webm"),
    quality: exportQualitySchema,
  }),
  v.strictObject({
    ...exportBaseEntries,
    format: v.literal("mp3"),
    quality: exportQualitySchema,
  }),
  v.strictObject({ ...exportBaseEntries, format: v.literal("wav") }),
  v.strictObject({
    ...exportBaseEntries,
    format: v.literal("ogg"),
    quality: exportQualitySchema,
  }),
]);

export const appSettingsSchema = v.object({
  lastCompositionId: v.nullable(v.string()),
});

export type Composition = v.InferOutput<typeof compositionSchema>;
export type MediaTrack = v.InferOutput<typeof mediaTrackSchema>;
export type Marker = v.InferOutput<typeof markerSchema>;
export type MediaDocument = v.InferOutput<typeof mediaDocumentSchema>;
export type Control = v.InferOutput<typeof controlSchema>;
export type ControlsDocument = v.InferOutput<typeof controlsDocumentSchema>;
export type ExportFormat = v.InferOutput<typeof exportFormatSchema>;
export type WriteFileInput = v.InferOutput<typeof writeFileInputSchema>;
export type StartExportInput = {
  compositionId: string;
  format: ExportFormat;
  quality?: number | undefined;
  timeSeconds?: number | undefined;
};
export type UpdateSettingsInput = v.InferOutput<typeof updateSettingsSchema>;
export type AppSettings = v.InferOutput<typeof appSettingsSchema>;
