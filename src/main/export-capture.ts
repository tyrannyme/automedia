import { spawn } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppError } from "@shared/errors.ts";
import { frameCount, frameFromTime, timeFromFrame } from "@shared/clock.ts";
import { audibleAssetTracks, audibleMusicTracks, isAudioExportFormat } from "@shared/media.ts";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import { launchChromium } from "./chromium.ts";
import { audioCodecArgs, audioFilterGraph } from "./export-audio.ts";
import {
  isWebpDecodable,
  runFfmpeg,
  throwIfCanceled,
  waitForDrain,
  waitForProcessExit,
} from "./export-ffmpeg.ts";
import { musicAudioTapSource, recordMusicAudio } from "./export-music-audio.ts";
import type { ExportJob } from "./export.ts";
import { compositionContentUrl, resolveLoopbackUrl, type LoopbackUrlSource } from "./loopback.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";
import type { CompositionStore } from "./store.ts";

async function withPage<T>(
  composition: Composition,
  run: (page: import("playwright").Page) => Promise<T>,
  loopbackUrl?: LoopbackUrlSource,
): Promise<T> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({
      viewport: { width: composition.width, height: composition.height },
      deviceScaleFactor: 1,
    });
    await page.addInitScript({ content: musicAudioTapSource });
    const url = compositionContentUrl(resolveLoopbackUrl(loopbackUrl), composition.id);
    const response = await page.goto(url, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new AppError(
        "export_failed",
        `preview returned ${response?.status() ?? "no response"}`,
      );
    }
    return await run(page);
  } finally {
    await browser.close();
  }
}

export async function capturePng(
  composition: Composition,
  timeSeconds: number,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  await withPage(
    composition,
    async (page) => {
      throwIfCanceled(isCanceled);
      const frame = frameFromTime(timeSeconds, composition.fps, composition.durationSeconds);
      await seekInjectedRuntime(page, timeSeconds, frame);
      throwIfCanceled(isCanceled);
      await waitForPaint(page);
      await page.screenshot({
        path: outputPath,
        omitBackground: composition.background === "transparent",
      });
    },
    loopbackUrl,
  );
}

export async function captureStillSequence(
  composition: Composition,
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  const totalFrames = frameCount(composition.durationSeconds, composition.fps);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "automedia-frames-"));
  try {
    await withPage(
      composition,
      async (page) => {
        for (let frame = 0; frame < totalFrames; frame += 1) {
          throwIfCanceled(isCanceled);
          const timeSeconds = timeFromFrame(frame, composition.fps);
          await seekInjectedRuntime(page, timeSeconds, frame);
          throwIfCanceled(isCanceled);
          await waitForPaint(page);
          await page.screenshot({
            path: path.join(tempDir, `${String(frame).padStart(6, "0")}.png`),
            omitBackground: composition.background === "transparent",
          });
        }
      },
      loopbackUrl,
    );
    throwIfCanceled(isCanceled);
    setEncodingPhase();
    if (job.format === "gif") {
      await runFfmpeg(
        [
          "-y",
          "-framerate",
          String(composition.fps),
          "-i",
          path.join(tempDir, "%06d.png"),
          "-vf",
          "split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a",
          "-loop",
          "0",
          outputPath,
        ],
        isCanceled,
      );
      return;
    }
    await runFfmpeg(
      [
        "-y",
        "-framerate",
        String(composition.fps),
        "-i",
        path.join(tempDir, "%06d.png"),
        "-c:v",
        "libwebp_anim",
        "-lossless",
        "1",
        "-preset",
        "drawing",
        "-pix_fmt",
        "bgra",
        "-loop",
        "0",
        "-an",
        ...(job.quality === undefined ? [] : ["-quality", String(job.quality)]),
        outputPath,
      ],
      isCanceled,
    );
    if (!(await isWebpDecodable(outputPath, isCanceled))) {
      await runFfmpeg(
        [
          "-y",
          "-framerate",
          String(composition.fps),
          "-i",
          path.join(tempDir, "%06d.png"),
          "-c:v",
          "libwebp",
          "-lossless",
          "1",
          "-preset",
          "drawing",
          "-pix_fmt",
          "bgra",
          "-an",
          ...(job.quality === undefined ? [] : ["-quality", String(job.quality)]),
          "-start_number",
          "0",
          "-frames:v",
          "1",
          path.join(tempDir, "webp-%06d.webp"),
        ],
        isCanceled,
      );
      await rename(path.join(tempDir, "webp-000000.webp"), outputPath);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function videoScaleFilter(width: number, height: number): string {
  return `scale=${width}:${height}:in_range=pc:out_range=tv`;
}

function videoEncodeArgs(
  composition: Composition,
  job: ExportJob,
  audible: MediaTrack[],
  musicFiles: string[],
  assetsDir: string,
  outputPath: string,
): string[] {
  const args = ["-y", "-f", "image2pipe", "-framerate", String(composition.fps), "-i", "pipe:0"];
  for (const track of audible) {
    args.push("-i", path.join(assetsDir, track.asset));
  }
  for (const file of musicFiles) {
    args.push("-i", file);
  }
  const hasAudio = audible.length > 0 || musicFiles.length > 0;
  if (hasAudio) {
    args.push(
      "-filter_complex",
      audioFilterGraph(composition, audible, musicFiles.length),
      "-map",
      "0:v",
      "-map",
      "[aout]",
    );
  } else {
    args.push("-map", "0:v", "-an");
  }
  if (job.format === "mp4") {
    const bitrate = 250_000 + (job.quality ?? 80) * 50_000;
    args.push(
      "-c:v",
      "libopenh264",
      "-b:v",
      String(bitrate),
      "-pix_fmt",
      "yuv420p",
      "-vf",
      videoScaleFilter(composition.width, composition.height),
    );
    if (hasAudio) {
      args.push(...audioCodecArgs("mp4"));
    }
    args.push("-movflags", "+faststart");
  } else {
    const crf = Math.round(40 - ((job.quality ?? 80) - 1) * (25 / 99));
    args.push(
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-vf",
      videoScaleFilter(composition.width, composition.height),
    );
    if (hasAudio) {
      args.push(...audioCodecArgs("webm"));
    }
  }
  args.push("-sn", "-dn", "-map_metadata", "-1", outputPath);
  return args;
}

export async function captureVideo(
  store: CompositionStore,
  composition: Composition,
  tracks: MediaTrack[],
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  const audible = audibleAssetTracks(tracks);
  const music = audibleMusicTracks(tracks);
  const hasVisualTracks = tracks.some(
    (track) => track.kind === "block" || track.kind === "image" || track.kind === "video",
  );
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const tempDir =
    music.length > 0 ? await mkdtemp(path.join(os.tmpdir(), "automedia-music-")) : undefined;

  try {
    await withPage(
      composition,
      async (page) => {
        throwIfCanceled(isCanceled);
        const musicFiles: string[] = [];
        if (music.length > 0 && tempDir) {
          const wavs = await recordMusicAudio(page, composition.durationSeconds, isCanceled);
          for (const [index, wav] of wavs.entries()) {
            const filePath = path.join(tempDir, `music-${index}.wav`);
            await writeFile(filePath, wav);
            musicFiles.push(filePath);
          }
        }
        const args = videoEncodeArgs(composition, job, audible, musicFiles, assetsDir, outputPath);
        const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
        const stderr: Buffer[] = [];
        ffmpeg.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
        const totalFrames = frameCount(composition.durationSeconds, composition.fps);
        const session = await page.context().newCDPSession(page);
        let latestFrame: Buffer | undefined;
        let sequence = 0;
        let stopped = false;
        let screencastStarted = false;
        const waiters = new Set<{
          afterSequence: number;
          resolve: (frame: Buffer) => void;
          reject: (error: Error) => void;
        }>();
        const onFrame = (frame: { data: string; sessionId: number }) => {
          const encoded = Buffer.from(frame.data, "base64");
          // ACK immediately. Chromium will not continue the screencast stream
          // while an earlier frame remains unacknowledged.
          void session
            .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
            .catch(() => undefined);
          // A fresh WebGPU page can emit an empty screencast event before its
          // first compositor frame. Do not pass that event to ffmpeg.
          if (encoded.length < 3 || encoded[0] !== 0xff || encoded[1] !== 0xd8) return;
          sequence += 1;
          latestFrame = encoded;
          for (const waiter of waiters) {
            if (sequence <= waiter.afterSequence) continue;
            waiters.delete(waiter);
            waiter.resolve(latestFrame);
          }
        };
        const rejectWaiters = (error: Error) => {
          for (const waiter of waiters) waiter.reject(error);
          waiters.clear();
        };
        const waitAfter = (afterSequence: number): Promise<Buffer> => {
          if (latestFrame !== undefined && sequence > afterSequence) {
            return Promise.resolve(latestFrame);
          }
          if (stopped) {
            return Promise.reject(new AppError("encode_failed", "preview compositor stopped"));
          }
          return new Promise<Buffer>((resolve, reject) => {
            waiters.add({ afterSequence, resolve, reject });
          });
        };
        const exitPromise = waitForProcessExit(ffmpeg, stderr);
        const processFailure = exitPromise.then(
          () =>
            Promise.reject(new AppError("encode_failed", "ffmpeg exited before capture completed")),
          (error) => Promise.reject(error),
        );
        // The normal completion path awaits exitPromise directly. Mark this
        // auxiliary race as handled so a successful encoder shutdown cannot leave
        // an unhandled rejection after the last frame has been written.
        void processFailure.catch(() => undefined);
        session.on("Page.screencastFrame", onFrame);
        try {
          await seekInjectedRuntime(page, 0, 0);
          await waitForPaint(page);
          const firstFrame = await page.screenshot({
            type: "jpeg",
            quality: job.quality ?? 80,
          });
          if (hasVisualTracks) {
            await session.send("Page.startScreencast", {
              format: "jpeg",
              quality: job.quality ?? 80,
              everyNthFrame: 1,
            });
            screencastStarted = true;
          }
          for (let frame = 0; frame < totalFrames; frame += 1) {
            throwIfCanceled(isCanceled);
            const captured =
              frame === 0 || !hasVisualTracks
                ? firstFrame
                : await Promise.race([
                    (async () => {
                      const beforeSeek = sequence;
                      await seekInjectedRuntime(page, timeFromFrame(frame, composition.fps), frame);
                      return waitAfter(beforeSeek);
                    })(),
                    processFailure,
                  ]).then((result) => result);
            throwIfCanceled(isCanceled);
            const stdin = ffmpeg.stdin;
            if (!stdin || stdin.destroyed || stdin.writableEnded) {
              throw new AppError("encode_failed", "ffmpeg input closed before capture completed");
            }
            const accepted = stdin.write(captured);
            if (!accepted) {
              await waitForDrain(stdin, isCanceled, processFailure);
            }
          }
          throwIfCanceled(isCanceled);
          setEncodingPhase();
          stopped = true;
          if (screencastStarted) await session.send("Page.stopScreencast");
          ffmpeg.stdin?.end();
          await exitPromise;
        } catch (error) {
          stopped = true;
          rejectWaiters(error instanceof Error ? error : new Error(String(error)));
          if (screencastStarted) {
            await session.send("Page.stopScreencast").catch(() => undefined);
          }
          ffmpeg.stdin?.destroy();
          if (ffmpeg.exitCode === null && !ffmpeg.killed) {
            ffmpeg.kill("SIGKILL");
          }
          await exitPromise.catch(() => undefined);
          throw error;
        } finally {
          session.off("Page.screencastFrame", onFrame);
          rejectWaiters(new AppError("encode_failed", "preview compositor stopped"));
        }
      },
      loopbackUrl,
    );
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function audioEncodeArgs(
  composition: Composition,
  job: ExportJob,
  audible: MediaTrack[],
  musicFiles: string[],
  assetsDir: string,
  outputPath: string,
): string[] {
  if (!isAudioExportFormat(job.format)) {
    throw new AppError("invalid_export", `${job.format} is not an audio export`);
  }
  const args = ["-y"];
  for (const track of audible) {
    args.push("-i", path.join(assetsDir, track.asset));
  }
  for (const file of musicFiles) {
    args.push("-i", file);
  }
  args.push(
    "-filter_complex",
    audioFilterGraph(composition, audible, musicFiles.length, 0),
    "-map",
    "[aout]",
    "-vn",
    ...audioCodecArgs(job.format, job.quality),
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    outputPath,
  );
  return args;
}

export async function captureAudio(
  store: CompositionStore,
  composition: Composition,
  tracks: MediaTrack[],
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  const audible = audibleAssetTracks(tracks);
  const music = audibleMusicTracks(tracks);
  if (audible.length === 0 && music.length === 0) {
    throw new AppError(
      "invalid_export",
      "audio export needs an unmuted audio, video, or music track",
    );
  }
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const tempDir =
    music.length > 0 ? await mkdtemp(path.join(os.tmpdir(), "automedia-music-")) : undefined;
  try {
    const musicFiles: string[] = [];
    if (music.length > 0 && tempDir) {
      await withPage(
        composition,
        async (page) => {
          throwIfCanceled(isCanceled);
          const wavs = await recordMusicAudio(page, composition.durationSeconds, isCanceled);
          for (const [index, wav] of wavs.entries()) {
            const filePath = path.join(tempDir, `music-${index}.wav`);
            await writeFile(filePath, wav);
            musicFiles.push(filePath);
          }
        },
        loopbackUrl,
      );
    }
    throwIfCanceled(isCanceled);
    setEncodingPhase();
    await runFfmpeg(
      audioEncodeArgs(composition, job, audible, musicFiles, assetsDir, outputPath),
      isCanceled,
    );
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
