import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@shared/errors.ts";
import { isExportFormat } from "@shared/media.ts";
import type { ExportFile } from "@shared/ipc.ts";
import type { Composition, ExportFormat } from "@shared/schemas.ts";
import { pathExists } from "./fs.ts";
import { probeFile } from "./probe.ts";
import type { CompositionStore } from "./store.ts";

export async function verifyVideo(
  filePath: string,
  composition: Composition,
  expectAudio: boolean,
  format: Extract<ExportFormat, "mp4" | "webm"> = "mp4",
): Promise<void> {
  const probe = await probeFile(filePath);
  const formatName = probe.formatName.toLowerCase();
  if (!formatName.includes(format)) {
    throw new AppError("verify_failed", `export container is not ${format}`);
  }
  const video = probe.streams.find((stream) => stream.codecType === "video");
  if (!video) {
    throw new AppError("verify_failed", "export has no video stream");
  }
  const codec = video.codecName.toLowerCase();
  const validCodec = format === "mp4" ? codec.includes("h264") : codec.includes("vp9");
  if (!validCodec) {
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
  const hasAudio = probe.streams.some((stream) => stream.codecType === "audio");
  if (hasAudio !== expectAudio) {
    throw new AppError(
      "verify_failed",
      expectAudio ? "export is missing audio" : "export has unexpected audio",
    );
  }
  if (hasAudio) {
    const audio = probe.streams.find((stream) => stream.codecType === "audio");
    const audioCodec = audio?.codecName.toLowerCase() ?? "";
    const expectedCodec = format === "mp4" ? "aac" : "opus";
    if (!audio || !audioCodec.includes(expectedCodec)) {
      throw new AppError("verify_failed", `export audio codec is not ${expectedCodec}`);
    }
  }
  if (Math.abs(probe.durationSeconds - composition.durationSeconds) > 0.15) {
    throw new AppError("verify_failed", "export duration does not match the composition");
  }
}

export async function verifyAudio(
  filePath: string,
  composition: Composition,
  format: Extract<ExportFormat, "mp3" | "wav" | "ogg">,
): Promise<void> {
  const probe = await probeFile(filePath);
  const formatName = probe.formatName.toLowerCase();
  const container = format === "wav" ? "wav" : format;
  if (!formatName.includes(container)) {
    throw new AppError("verify_failed", `export container is not ${format}`);
  }
  if (probe.streams.some((stream) => stream.codecType === "video")) {
    throw new AppError("verify_failed", "audio export has a video stream");
  }
  const audio = probe.streams.find((stream) => stream.codecType === "audio");
  if (!audio) {
    throw new AppError("verify_failed", "export has no audio stream");
  }
  const codec = audio.codecName.toLowerCase();
  const expectedCodec = format === "mp3" ? "mp3" : format === "wav" ? "pcm" : "vorbis";
  if (!codec.includes(expectedCodec)) {
    throw new AppError("verify_failed", `export audio codec is not ${expectedCodec}`);
  }
  if (Math.abs(probe.durationSeconds - composition.durationSeconds) > 0.15) {
    throw new AppError("verify_failed", "export duration does not match the composition");
  }
}

export async function exportFileExists(
  store: CompositionStore,
  compositionId: string,
  jobId: string,
): Promise<string> {
  const dir = path.join(store.compositionDir(compositionId), "exports");
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
      jobId: match[1] ?? "",
      format,
      fileName: entry.name,
      mtimeMs: info.mtimeMs,
    });
  }
  return files.toSorted((a, b) => b.mtimeMs - a.mtimeMs);
}
