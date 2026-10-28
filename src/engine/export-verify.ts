import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import { isExportFormat } from "@shared/media.ts";
import type { ExportFile } from "@shared/ipc.ts";
import type { Composition, ExportFormat } from "@shared/schemas.ts";
import { pathExists } from "./fs.ts";
import { probeFile, type ProbeResult } from "./probe.ts";
import type { CompositionStore } from "./store.ts";

const containers = {
  mp4: "MP4",
  webm: "WebM",
  mp3: "MP3",
  wav: "WAVE",
  ogg: "Ogg",
} as const;

function verifyContainer(probe: ProbeResult, format: keyof typeof containers): void {
  if (probe.formatName !== containers[format]) {
    throw new AppError("verify_failed", `export container is not ${format}`);
  }
}

function verifyDuration(probe: ProbeResult, composition: Composition): void {
  if (Math.abs(probe.durationSeconds - composition.durationSeconds) > 0.15) {
    throw new AppError("verify_failed", "export duration does not match the composition");
  }
}

export async function verifyVideo(
  filePath: string,
  composition: Composition,
  expectAudio: boolean,
  format: Extract<ExportFormat, "mp4" | "webm"> = "mp4",
): Promise<void> {
  const probe = await probeFile(filePath);
  verifyContainer(probe, format);
  const video = probe.streams.find((stream) => stream.codecType === "video");
  if (!video) {
    throw new AppError("verify_failed", "export has no video stream");
  }
  if (video.codecName !== (format === "mp4" ? "avc" : "vp9")) {
    throw new AppError("verify_failed", `export video codec is not valid for ${format}`);
  }
  if (video.width !== composition.width || video.height !== composition.height) {
    throw new AppError("verify_failed", "export dimensions do not match the composition");
  }
  if (
    video.fps === undefined ||
    (Math.abs(video.fps - composition.fps) > 0.05 && Math.round(video.fps) !== composition.fps)
  ) {
    throw new AppError("verify_failed", "export frame rate does not match the composition");
  }
  const audio = probe.streams.find((stream) => stream.codecType === "audio");
  if (Boolean(audio) !== expectAudio) {
    throw new AppError(
      "verify_failed",
      expectAudio ? "export is missing audio" : "export has unexpected audio",
    );
  }
  const expectedCodec = format === "mp4" ? "aac" : "opus";
  if (audio && audio.codecName !== expectedCodec) {
    throw new AppError("verify_failed", `export audio codec is not ${expectedCodec}`);
  }
  verifyDuration(probe, composition);
}

export async function verifyAudio(
  filePath: string,
  composition: Composition,
  format: Extract<ExportFormat, "mp3" | "wav" | "ogg">,
): Promise<void> {
  const probe = await probeFile(filePath);
  verifyContainer(probe, format);
  if (probe.streams.some((stream) => stream.codecType === "video")) {
    throw new AppError("verify_failed", "audio export has a video stream");
  }
  const audio = probe.streams.find((stream) => stream.codecType === "audio");
  if (!audio) {
    throw new AppError("verify_failed", "export has no audio stream");
  }
  const expectedCodec = format === "mp3" ? "mp3" : format === "wav" ? "pcm-s16" : "vorbis";
  if (audio.codecName !== expectedCodec) {
    throw new AppError("verify_failed", `export audio codec is not ${expectedCodec}`);
  }
  verifyDuration(probe, composition);
}

const INDEX = ".exports.json";
const exportIndexSchema = v.record(v.string(), v.string());

/** Export files are named after the project; this index maps each file back to its job id. */
async function readExportIndex(exportsDir: string): Promise<Record<string, string>> {
  try {
    const parsed = v.safeParse(
      exportIndexSchema,
      JSON.parse(await readFile(path.join(exportsDir, INDEX), "utf8")),
    );
    return parsed.success ? parsed.output : {};
  } catch {
    return {};
  }
}

const indexWrites = new Map<string, Promise<void>>();

/** Records which job wrote `fileName`. Writes per folder run one at a time. */
export function recordExportFile(
  exportsDir: string,
  fileName: string,
  jobId: string,
): Promise<void> {
  const previous = indexWrites.get(exportsDir) ?? Promise.resolve();
  const next = previous.then(async () => {
    const index = await readExportIndex(exportsDir);
    index[fileName] = jobId;
    await writeFile(path.join(exportsDir, INDEX), `${JSON.stringify(index, null, 2)}\n`);
  });
  indexWrites.set(
    exportsDir,
    next.catch(() => {}),
  );
  return next;
}

export async function exportFileExists(
  store: CompositionStore,
  compositionId: string,
  jobId: string,
): Promise<string> {
  const dir = path.join(store.compositionDir(compositionId), "exports");
  const named = Object.entries(await readExportIndex(dir)).find(([, id]) => id === jobId)?.[0];
  if (named && (await pathExists(path.join(dir, named)))) return path.join(dir, named);
  for (const format of ["png", "gif", "webp", "mp4", "webm", "mp3", "wav", "ogg"] as const) {
    const filePath = path.join(dir, `${jobId}.${format}`);
    if (await pathExists(filePath)) {
      return filePath;
    }
  }
  throw new AppError("not_found", `export ${jobId} is not on disk`);
}

export async function listExports(
  store: CompositionStore,
  compositionId: string,
): Promise<ExportFile[]> {
  await store.get(compositionId);
  const exportsDir = path.join(store.compositionDir(compositionId), "exports");
  if (!(await pathExists(exportsDir))) {
    return [];
  }
  const entries = await readdir(exportsDir, { withFileTypes: true });
  const index = await readExportIndex(exportsDir);
  const files: ExportFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".") || entry.name.includes(".automedia-tmp.")) {
      continue;
    }
    const match = /^([a-z0-9-]+)\.(png|gif|webp|mp4|webm|mp3|wav|ogg)$/.exec(entry.name);
    if (!match) {
      continue;
    }
    const info = await stat(path.join(exportsDir, entry.name));
    const format = match[2];
    if (!isExportFormat(format)) {
      continue;
    }
    files.push({
      jobId: index[entry.name] ?? match[1] ?? "",
      format,
      fileName: entry.name,
      mtimeMs: info.mtimeMs,
      bytes: info.size,
    });
  }
  return files.toSorted((a, b) => b.mtimeMs - a.mtimeMs);
}
