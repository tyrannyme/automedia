import path from "node:path";
import { rename } from "node:fs/promises";
import { AppError } from "@shared/errors.ts";
import {
  exportExpectsAudio,
  exportNeedsFfmpeg,
  exportNeedsQuality,
  isAudioExportFormat,
  isVideoExportFormat,
} from "@shared/media.ts";
import { ffmpegHealth, missingBinaryError } from "./ffmpeg.ts";
import type { ExportFormat, StartExportInput } from "@shared/schemas.ts";
import { createId, ensureDir, pathExists, removeFile } from "./fs.ts";
import { captureAudio, capturePng, captureStillSequence, captureVideo } from "./export-capture.ts";
import { compositionExportUrl, resolveLoopbackUrl, type LoopbackUrlSource } from "./loopback.ts";
import type { CompositionStore } from "./store.ts";
import { validateComposition } from "./validate.ts";
import { verifyAudio, verifyVideo } from "./export-verify.ts";

export type ExportPhase =
  | "queued"
  | "loading"
  | "probing"
  | "capturing"
  | "encoding"
  | "verifying"
  | "completed"
  | "canceled"
  | "failed";

export type ExportJob = {
  id: string;
  compositionId: string;
  format: ExportFormat;
  phase: ExportPhase;
  quality?: number;
  timeSeconds?: number;
  contentUrl?: string;
  outputPath?: string;
  error?: { code: string; message: string };
};

type QueueItem = {
  job: ExportJob;
  cancel: () => void;
};

export class ExportQueue {
  private readonly jobs = new Map<string, ExportJob>();
  private readonly pending: QueueItem[] = [];
  private active: QueueItem | undefined;
  private canceled = new Set<string>();

  constructor(
    private readonly store: CompositionStore,
    private readonly onChange: (job: ExportJob) => void,
    private readonly loopbackUrl?: LoopbackUrlSource,
  ) {}

  get(id: string): ExportJob {
    const job = this.jobs.get(id);
    if (!job) {
      throw new AppError("not_found", `export ${id} does not exist`);
    }
    return job;
  }

  listJobs(): ExportJob[] {
    return [...this.jobs.values()];
  }

  async start(input: StartExportInput): Promise<ExportJob> {
    if (!exportNeedsQuality(input.format) && input.quality !== undefined) {
      throw new AppError("invalid_export", `${input.format} does not take a quality number`);
    }
    if (input.format !== "png" && input.timeSeconds !== undefined) {
      throw new AppError("invalid_export", "timeSeconds is PNG-only");
    }
    const composition = await this.store.get(input.compositionId);
    if (
      isVideoExportFormat(input.format) &&
      (composition.width % 2 !== 0 || composition.height % 2 !== 0)
    ) {
      throw new AppError("odd_dimensions", "MP4 and WebM need even width and height");
    }
    const media = await this.store.getMedia(input.compositionId);
    if (isAudioExportFormat(input.format) && !exportExpectsAudio(media.tracks)) {
      throw new AppError(
        "invalid_export",
        "audio export needs an unmuted audio, video, or music track",
      );
    }
    if (exportNeedsFfmpeg(input.format)) {
      const health = await ffmpegHealth();
      if (!health.ffmpeg) throw missingBinaryError("ffmpeg");
      if (!health.ffprobe) throw missingBinaryError("ffprobe");
    }
    const validation = await validateComposition(composition, media, this.loopbackUrl);
    if (!validation.ok) {
      throw new AppError(
        "validate_failed",
        validation.issues.map((issue) => issue.message).join("; "),
      );
    }
    const job: ExportJob = {
      id: createId("j"),
      compositionId: input.compositionId,
      format: input.format,
      phase: "queued",
    };
    if (input.quality !== undefined) {
      job.quality = input.quality;
    }
    if (input.timeSeconds !== undefined) {
      job.timeSeconds = input.timeSeconds;
    }
    this.jobs.set(job.id, job);
    const item: QueueItem = { job, cancel: () => this.canceled.add(job.id) };
    this.pending.push(item);
    this.onChange(job);
    void this.pump();
    return job;
  }

  cancel(id: string): ExportJob {
    const job = this.get(id);
    if (job.phase === "completed") {
      throw new AppError("invalid_export", "completed export cannot be canceled");
    }
    this.canceled.add(id);
    job.phase = "canceled";
    if (job.outputPath) {
      const tempPath = `${job.outputPath}.automedia-tmp.${job.format}`;
      void removeFile(job.outputPath).catch(() => {
        console.error("failed to remove canceled export");
      });
      void removeFile(tempPath).catch(() => {
        console.error("failed to remove canceled export temp");
      });
    }
    this.onChange(job);
    return job;
  }

  private async pump(): Promise<void> {
    if (this.active) {
      return;
    }
    const item = this.pending.shift();
    if (!item) {
      return;
    }
    this.active = item;
    try {
      await this.run(item.job);
    } catch (error) {
      if (!this.canceled.has(item.job.id)) {
        item.job.phase = "failed";
        item.job.error =
          error instanceof AppError
            ? { code: error.code, message: error.message }
            : {
                code: "export_failed",
                message: error instanceof Error ? error.message : "export failed",
              };
        this.onChange(item.job);
      }
    } finally {
      this.active = undefined;
      void this.pump();
    }
  }

  private assertActive(job: ExportJob): void {
    if (this.canceled.has(job.id)) {
      throw new AppError("canceled", "export canceled");
    }
  }

  private async run(job: ExportJob): Promise<void> {
    let tempPath: string | undefined;
    let finalPath: string | undefined;
    const isCanceled = () => this.canceled.has(job.id);
    this.setPhase(job, "loading");
    const composition = await this.store.get(job.compositionId);
    const media = await this.store.getMedia(job.compositionId);
    this.setPhase(job, "probing");
    this.assertActive(job);
    if (isVideoExportFormat(job.format) && composition.background === "transparent") {
      throw new AppError(
        "opaque_background_required",
        "video export requires an opaque background",
      );
    }
    const exportsDir = path.join(this.store.compositionDir(job.compositionId), "exports");
    await ensureDir(exportsDir);
    const fileName = `${job.id}.${job.format}`;
    finalPath = path.join(exportsDir, fileName);
    tempPath = `${finalPath}.automedia-tmp.${job.format}`;
    job.outputPath = finalPath;
    try {
      this.setPhase(job, "capturing");
      if (job.format === "png") {
        await capturePng(composition, job.timeSeconds ?? 0, tempPath, isCanceled, this.loopbackUrl);
      } else if (job.format === "gif" || job.format === "webp") {
        await captureStillSequence(
          composition,
          job,
          tempPath,
          isCanceled,
          () => this.setPhase(job, "encoding"),
          this.loopbackUrl,
        );
      } else if (isAudioExportFormat(job.format)) {
        await captureAudio(
          this.store,
          composition,
          media.tracks,
          job,
          tempPath,
          isCanceled,
          () => this.setPhase(job, "encoding"),
          this.loopbackUrl,
        );
      } else {
        await captureVideo(
          this.store,
          composition,
          media.tracks,
          job,
          tempPath,
          isCanceled,
          () => this.setPhase(job, "encoding"),
          this.loopbackUrl,
        );
      }

      this.setPhase(job, "verifying");
      this.assertActive(job);
      if (!(await pathExists(tempPath))) {
        throw new AppError("verify_failed", "export output was not created");
      }
      if (isVideoExportFormat(job.format)) {
        await verifyVideo(tempPath, composition, exportExpectsAudio(media.tracks), job.format);
      } else if (isAudioExportFormat(job.format)) {
        await verifyAudio(tempPath, composition, job.format);
      }
      this.assertActive(job);
      await rename(tempPath, finalPath);
      tempPath = undefined;
      this.assertActive(job);
      job.phase = "completed";
      job.contentUrl = compositionExportUrl(
        resolveLoopbackUrl(this.loopbackUrl),
        job.compositionId,
        job.id,
      );
      this.onChange(job);
    } finally {
      if (isCanceled()) {
        await Promise.all([
          tempPath ? removeFile(tempPath) : Promise.resolve(),
          finalPath ? removeFile(finalPath) : Promise.resolve(),
        ]);
      } else if (tempPath) {
        await removeFile(tempPath);
      }
    }
  }

  private setPhase(job: ExportJob, phase: ExportPhase): void {
    this.assertActive(job);
    job.phase = phase;
    this.onChange(job);
  }
}

export { audioCodecArgs, audioFilterGraph, atempoChain } from "./export-audio.ts";
export { exportFileExists, listExports, verifyAudio, verifyVideo } from "./export-verify.ts";
