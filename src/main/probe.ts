import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as v from "valibot";
import { AppError, mapMissingBinaryError } from "@shared/errors.ts";

const execFileAsync = promisify(execFile);

const codecTypeSchema = v.picklist(["audio", "video", "subtitle", "data", "attachment"]);

const ffprobeStreamSchema = v.object({
  codec_type: v.optional(v.string()),
  codec_name: v.optional(v.string()),
  duration: v.optional(v.union([v.string(), v.number()])),
  width: v.optional(v.union([v.string(), v.number()])),
  height: v.optional(v.union([v.string(), v.number()])),
  r_frame_rate: v.optional(v.union([v.string(), v.number()])),
  avg_frame_rate: v.optional(v.union([v.string(), v.number()])),
});

const ffprobeJsonSchema = v.object({
  format: v.optional(
    v.object({
      format_name: v.optional(v.string()),
      duration: v.optional(v.union([v.string(), v.number()])),
    }),
  ),
  streams: v.optional(v.array(ffprobeStreamSchema)),
});

export type MediaStream = {
  codecType: v.InferOutput<typeof codecTypeSchema>;
  codecName: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
};

export type ProbeResult = {
  formatName: string;
  durationSeconds: number;
  streams: MediaStream[];
};

export async function probeFile(filePath: string): Promise<ProbeResult> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-print_format", "json", filePath],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (error) {
    const missing = mapMissingBinaryError(error);
    if (missing) throw missing;
    const message = error instanceof Error ? error.message : "ffprobe failed";
    throw new AppError("probe_failed", message);
  }

  const parsed = v.parse(ffprobeJsonSchema, JSON.parse(stdout));
  const formatDuration = Number(parsed.format?.duration ?? 0);
  const streams = (parsed.streams ?? []).map((stream) => {
    const codecType = v.is(codecTypeSchema, stream.codec_type) ? stream.codec_type : "data";
    const durationSeconds = Number(stream.duration ?? formatDuration);
    const width = finiteNumber(stream.width);
    const height = finiteNumber(stream.height);
    const fps = parseFrameRate(stream.r_frame_rate, stream.avg_frame_rate);
    const result: MediaStream = {
      codecType,
      codecName: stream.codec_name ?? "",
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : formatDuration,
    };
    if (width !== undefined) {
      result.width = width;
    }
    if (height !== undefined) {
      result.height = height;
    }
    if (fps !== undefined) {
      result.fps = fps;
    }
    return result;
  });

  return {
    formatName: parsed.format?.format_name ?? "",
    durationSeconds: Number.isFinite(formatDuration) ? formatDuration : 0,
    streams,
  };
}

function finiteNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function parseFrameRate(
  rFrameRate: string | number | undefined,
  avgFrameRate: string | number | undefined,
): number | undefined {
  return parseRate(rFrameRate) ?? parseRate(avgFrameRate);
}

function parseRate(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "0/0") {
    return undefined;
  }
  const [numerator, denominator] = String(value).split("/").map(Number);
  const fps = denominator === undefined ? numerator : numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}
