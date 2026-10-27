import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { AppError, throwIfCanceled } from "@shared/errors.ts";
import { frameCount, frameFromTime, timeFromFrame } from "@shared/clock.ts";
import { audibleAssetTracks, audibleMusicTracks, isAudioExportFormat } from "@shared/media.ts";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import {
  assetClips,
  audioEncoding,
  audioFeeder,
  mixSampleRate,
  mixTimeline,
  musicClip,
  type AudioClip,
  type AudioExportFormat,
  type Pcm,
} from "./export-audio.ts";
import { renderMusicAudio } from "./export-music-audio.ts";
import type { ExportJob } from "./export.ts";
import { farmWorkers, openFarmPage } from "./frame-farm.ts";
import {
  compositionContentUrl,
  compositionRenderUrl,
  resolveLoopbackUrl,
  type LoopbackUrlSource,
} from "./loopback.ts";
import {
  AudioSampleSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  FilePathTarget,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  Quality,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioEncodingConfig,
  type OutputFormat,
} from "./mediabunny.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";
import { decodePngOffThread, type RgbaImage } from "./png.ts";
import type { RenderPool } from "./render-pool.ts";
import { prepareSeekProxies } from "./seek-proxies.ts";
import type { CompositionStore } from "./store.ts";
import type { Frame } from "node-av";
import { openFrameConverter, openFrameEncoder, type EncodedFrame } from "./video-encoder.ts";
import {
  encodeAnimatedWebp,
  encodeGif,
  maxAnimatedWebpBytes,
  type AnimationFrame,
} from "./animation.ts";

async function withPage<T>(
  pool: RenderPool,
  composition: Composition,
  run: (page: Page) => Promise<T>,
  loopbackUrl?: LoopbackUrlSource,
): Promise<T> {
  return pool.withPage(composition, async (page) => {
    const url = compositionContentUrl(resolveLoopbackUrl(loopbackUrl), composition.id);
    const response = await page.goto(url, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new AppError(
        "export_failed",
        `preview returned ${response?.status() ?? "no response"}`,
      );
    }
    return run(page);
  });
}

async function screenshotRgba(page: Page, composition: Composition): Promise<RgbaImage> {
  return decodePngOffThread(
    await page.screenshot({ omitBackground: composition.background === "transparent" }),
  );
}

export async function capturePng(
  pool: RenderPool,
  composition: Composition,
  timeSeconds: number,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  await withPage(
    pool,
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

/**
 * Per-frame display times in `unitMs` steps. Rounding the running clock
 * rather than each frame keeps the total length exact: 30 fps in GIF's
 * centiseconds becomes 30, 40, 30, 30, 40, ... instead of drifting.
 */
export function frameDelays(totalFrames: number, fps: number, unitMs: number): number[] {
  const at = (frame: number) => Math.round((frame * 1000) / fps / unitMs) * unitMs;
  return Array.from({ length: totalFrames }, (_, frame) => at(frame + 1) - at(frame));
}

/** Frames captured so far, of the composition's total. */
export type CaptureProgress = (frame: number, frames: number) => void;

export async function captureStillSequence(
  pool: RenderPool,
  composition: Composition,
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
  onProgress: CaptureProgress = () => undefined,
): Promise<void> {
  const totalFrames = frameCount(composition.durationSeconds, composition.fps);
  const frameBytes = composition.width * composition.height * 4;
  if (job.format === "webp" && totalFrames * frameBytes > maxAnimatedWebpBytes) {
    throw new AppError(
      "export_too_large",
      "animated WebP is limited to about 1.5 GB of frames; shorten the composition, lower its size or fps, or export GIF or video",
    );
  }
  // GIF delays are centiseconds; WebP delays are milliseconds.
  const delays = frameDelays(totalFrames, composition.fps, job.format === "gif" ? 10 : 1);
  const frames: AnimationFrame[] = [];
  await withPage(
    pool,
    composition,
    async (page) => {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        throwIfCanceled(isCanceled);
        await seekInjectedRuntime(page, timeFromFrame(frame, composition.fps), frame);
        throwIfCanceled(isCanceled);
        await waitForPaint(page);
        const { data } = await screenshotRgba(page, composition);
        frames.push({ rgba: data, durationMs: delays[frame] ?? 0 });
        onProgress(frame + 1, totalFrames);
      }
    },
    loopbackUrl,
  );
  throwIfCanceled(isCanceled);
  setEncodingPhase();
  const encoded =
    job.format === "gif"
      ? await encodeGif(composition.width, composition.height, frames)
      : await encodeAnimatedWebp(composition.width, composition.height, frames, job.quality);
  throwIfCanceled(isCanceled);
  await writeFile(outputPath, encoded);
}

function audioEncodingConfig(format: AudioExportFormat, quality?: number): AudioEncodingConfig {
  const { codec, rate } = audioEncoding(format, quality);
  return rate ? { codec, quality: new Quality(rate) } : { codec };
}

function outputFormat(format: AudioExportFormat): OutputFormat {
  if (format === "mp4") return new Mp4OutputFormat({ fastStart: "reserve" });
  if (format === "webm") return new WebMOutputFormat();
  if (format === "mp3") return new Mp3OutputFormat();
  if (format === "ogg") return new OggOutputFormat();
  return new WavOutputFormat();
}

/**
 * Adds the music tracks to `clips`. Each clip renders offline in its own
 * music document, from cycle 0 at the clip's start, as the preview plays it.
 */
async function timelineAudio(
  pool: RenderPool,
  composition: Composition,
  tracks: MediaTrack[],
  clips: AudioClip[],
  isCanceled: () => boolean,
  loopbackUrl?: LoopbackUrlSource,
): Promise<AudioClip[]> {
  const music: AudioClip[] = [];
  for (const track of audibleMusicTracks(tracks)) {
    throwIfCanceled(isCanceled);
    const duration = Math.min(track.duration, composition.durationSeconds - track.start);
    if (duration <= 0) continue;
    const wav = await pool.withPage(composition, async (page) => {
      const base = compositionContentUrl(resolveLoopbackUrl(loopbackUrl), composition.id);
      const url = new URL(`music/${encodeURIComponent(track.asset)}/index.html`, base).href;
      const response = await page.goto(url, { waitUntil: "load" });
      if (!response || !response.ok()) {
        throw new AppError(
          "export_failed",
          `music returned ${response?.status() ?? "no response"}`,
        );
      }
      return renderMusicAudio(page, duration, track.volume, mixSampleRate);
    });
    music.push(musicClip(wav, track.start, duration));
  }
  return [...clips, ...music];
}

/**
 * Takes frames captured out of order and writes them in order, one at a time.
 * `room` holds a capture back while its frame is `window` or more ahead of
 * the writer, which bounds the frames held in memory. After `fail`, or a
 * failed write, `room` throws, so no capture waits on a frame that will never
 * come.
 */
export function orderedFrames<T>(
  write: (frame: number, image: T) => Promise<void>,
  window: number,
) {
  const pending = new Map<number, T>();
  let next = 0;
  let tail = Promise.resolve();
  let failure: { error: Error } | undefined;
  let progress = Promise.withResolvers<void>();
  const wake = () => {
    progress.resolve();
    progress = Promise.withResolvers<void>();
  };
  const fail = (error: Error) => {
    failure ??= { error };
    wake();
  };
  const drain = async () => {
    while (pending.has(next)) {
      // SAFETY: `has` just found the frame.
      const image = pending.get(next) as T;
      pending.delete(next);
      await write(next, image);
      next += 1;
      wake();
    }
  };
  return {
    async room(frame: number): Promise<void> {
      for (;;) {
        if (failure) throw failure.error;
        if (frame - next < window) return;
        await progress.promise;
      }
    },
    put(frame: number, image: T): void {
      pending.set(frame, image);
      tail = tail.then(drain);
      tail.catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
    },
    fail,
    /** Settles once every frame put so far is written. */
    async finish(): Promise<void> {
      await tail;
      if (failure) throw failure.error;
    },
  };
}

export type VideoWriter = {
  /** Adds the next frame, as a {@link FrameConverter} made it, and frees it. */
  addFrame(frame: number, image: Frame): Promise<void>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
};

/**
 * Opens an MP4 (H.264/AAC) or WebM (VP9/Opus) file and accepts frames in
 * order. The optional mix is fed alongside the frames so the muxer can
 * interleave both tracks without buffering either one.
 */
export async function openVideoWriter(
  outputPath: string,
  format: "mp4" | "webm",
  composition: Pick<Composition, "width" | "height" | "fps" | "durationSeconds">,
  quality = 80,
  pcm?: Pcm,
): Promise<VideoWriter> {
  const encoder = await openFrameEncoder(
    format,
    quality,
    composition.width,
    composition.height,
    composition.fps,
  );
  const output = new Output({
    format: outputFormat(format),
    target: new FilePathTarget(outputPath),
  });
  const video = new EncodedVideoPacketSource(format === "mp4" ? "avc" : "vp9");
  output.addVideoTrack(video, {
    frameRate: composition.fps,
    maximumPacketCount: frameCount(composition.durationSeconds, composition.fps),
  });
  let feedAudio: ((untilSeconds: number) => Promise<void>) | undefined;
  if (pcm) {
    const audio = new AudioSampleSource(audioEncodingConfig(format));
    output.addAudioTrack(audio, {
      // AAC packs 1024 samples per packet, plus encoder priming.
      maximumPacketCount: Math.ceil((composition.durationSeconds * mixSampleRate) / 1024) + 16,
    });
    feedAudio = audioFeeder(audio, pcm);
  }
  await output.start();
  let described = false;
  const addPackets = async (packets: EncodedFrame[]) => {
    for (const packet of packets) {
      const encoded = new EncodedPacket(
        packet.data,
        packet.key ? "key" : "delta",
        packet.frame / composition.fps,
        1 / composition.fps,
      );
      await video.add(
        encoded,
        described
          ? undefined
          : {
              decoderConfig: {
                codec: encoder.codec(),
                codedWidth: composition.width,
                codedHeight: composition.height,
                colorSpace: {
                  primaries: "bt709",
                  transfer: "bt709",
                  matrix: "bt709",
                  fullRange: false,
                },
              },
            },
      );
      described = true;
    }
  };
  return {
    async addFrame(frame, image) {
      await addPackets(await encoder.encode(image));
      await feedAudio?.((frame + 1) / composition.fps);
    },
    async finish() {
      try {
        await addPackets(await encoder.flush());
        await feedAudio?.(Infinity);
        await output.finalize();
      } finally {
        encoder.close();
      }
    },
    async cancel() {
      encoder.close();
      await output.cancel().catch(() => undefined);
    },
  };
}

export async function captureVideo(
  pool: RenderPool,
  store: CompositionStore,
  composition: Composition,
  tracks: MediaTrack[],
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
  onProgress: CaptureProgress = () => undefined,
  workers = farmWorkers(),
): Promise<void> {
  if (job.format !== "mp4" && job.format !== "webm") {
    throw new AppError("invalid_export", `${job.format} is not a video export`);
  }
  const format = job.format;
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const hasVisualTracks = tracks.some(
    (track) => track.kind === "block" || track.kind === "image" || track.kind === "video",
  );
  const totalFrames = frameCount(composition.durationSeconds, composition.fps);

  throwIfCanceled(isCanceled);
  // The music renders in the shared browser while the farm's browsers start.
  // The writer opens once the mix is ready; frames wait for it.
  const writerReady = timelineAudio(
    pool,
    composition,
    tracks,
    assetClips(assetsDir, audibleAssetTracks(tracks)),
    isCanceled,
    loopbackUrl,
  )
    .then((clips) =>
      clips.length > 0 ? mixTimeline(composition.durationSeconds, clips, isCanceled) : undefined,
    )
    .then((pcm) => openVideoWriter(outputPath, format, composition, job.quality, pcm));
  writerReady.catch(() => undefined);
  const url = compositionRenderUrl(resolveLoopbackUrl(loopbackUrl), composition.id);
  try {
    onProgress(0, totalFrames);
    if (hasVisualTracks) {
      // A farm page loads every video once, so the proxies come first.
      await prepareSeekProxies(store.root, assetsDir);
      const frames = orderedFrames<Frame>(async (frame, image) => {
        throwIfCanceled(isCanceled);
        await (await writerReady).addFrame(frame, image);
        onProgress(frame + 1, totalFrames);
      }, workers * 4);
      let claimed = 0;
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(workers, totalFrames) }, async () => {
          const page = await openFarmPage(composition, url);
          const converter = await openFrameConverter();
          try {
            // Each page takes the next frame nobody has yet, so a slow page
            // never holds the others to its pace.
            for (let frame = claimed++; frame < totalFrames; frame = claimed++) {
              throwIfCanceled(isCanceled);
              await frames.room(frame);
              frames.put(frame, await converter.convert(await page.capture(frame)));
            }
          } finally {
            converter.close();
            await page.close();
          }
        }).map((work) =>
          work.catch((error) => {
            frames.fail(error instanceof Error ? error : new Error(String(error)));
            throw error;
          }),
        ),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      await frames.finish();
    } else {
      // Nothing on the timeline moves: the background is every frame.
      const page = await openFarmPage(composition, url);
      const jpeg = await page.capture(0).finally(() => page.close());
      const converter = await openFrameConverter();
      const writer = await writerReady;
      try {
        const image = await converter.convert(jpeg);
        for (let frame = 0; frame < totalFrames; frame += 1) {
          throwIfCanceled(isCanceled);
          const copy = image.clone();
          if (!copy) throw new AppError("encode_failed", "could not copy the frame");
          await writer.addFrame(frame, copy);
          onProgress(frame + 1, totalFrames);
        }
        image.free();
      } finally {
        converter.close();
      }
    }
    throwIfCanceled(isCanceled);
    setEncodingPhase();
    await (await writerReady).finish();
  } catch (error) {
    await (await writerReady.catch(() => undefined))?.cancel();
    throw error;
  }
}

export async function captureAudio(
  pool: RenderPool,
  store: CompositionStore,
  composition: Composition,
  tracks: MediaTrack[],
  job: ExportJob,
  outputPath: string,
  isCanceled: () => boolean = () => false,
  setEncodingPhase: () => void = () => undefined,
  loopbackUrl?: LoopbackUrlSource,
): Promise<void> {
  if (!isAudioExportFormat(job.format)) {
    throw new AppError("invalid_export", `${job.format} is not an audio export`);
  }
  const format = job.format;
  const audible = audibleAssetTracks(tracks);
  const hasMusic = audibleMusicTracks(tracks).length > 0;
  if (audible.length === 0 && !hasMusic) {
    throw new AppError(
      "invalid_export",
      "audio export needs an unmuted audio, video, or music track",
    );
  }
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const clips = await timelineAudio(
    pool,
    composition,
    tracks,
    assetClips(assetsDir, audible),
    isCanceled,
    loopbackUrl,
  );
  throwIfCanceled(isCanceled);
  setEncodingPhase();
  const pcm = await mixTimeline(composition.durationSeconds, clips, isCanceled);
  throwIfCanceled(isCanceled);
  await encodeAudioFile(pcm, format, outputPath, job.quality);
}

/** Writes a rendered mix as an audio-only MP3, WAV, or Ogg file. */
export async function encodeAudioFile(
  pcm: Pcm,
  format: Extract<AudioExportFormat, "mp3" | "wav" | "ogg">,
  outputPath: string,
  quality?: number,
): Promise<void> {
  const output = new Output({
    format: outputFormat(format),
    target: new FilePathTarget(outputPath),
  });
  const audio = new AudioSampleSource(audioEncodingConfig(format, quality));
  output.addAudioTrack(audio);
  try {
    await output.start();
    await audioFeeder(audio, pcm)(Infinity);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
}
