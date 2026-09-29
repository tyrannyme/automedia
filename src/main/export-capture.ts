import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CDPSession, Page } from "playwright";
import { AppError, throwIfCanceled } from "@shared/errors.ts";
import { frameCount, frameFromTime, timeFromFrame } from "@shared/clock.ts";
import { audibleAssetTracks, audibleMusicTracks, isAudioExportFormat } from "@shared/media.ts";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import { launchChromium } from "./chromium.ts";
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
import { musicAudioTapSource, recordMusicAudio } from "./export-music-audio.ts";
import type { ExportJob } from "./export.ts";
import { compositionContentUrl, resolveLoopbackUrl, type LoopbackUrlSource } from "./loopback.ts";
import {
  AudioSampleSource,
  FilePathTarget,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioEncodingConfig,
  type OutputFormat,
  type QuantitativeQualityOptions,
  type VideoCodec,
} from "./mediabunny.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";
import { decodePng, type RgbaImage } from "./png.ts";
import type { CompositionStore } from "./store.ts";
import {
  encodeAnimatedWebp,
  encodeGif,
  maxAnimatedWebpBytes,
  type AnimationFrame,
} from "./animation.ts";

async function withPage<T>(
  composition: Composition,
  run: (page: Page) => Promise<T>,
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

async function screenshotRgba(page: Page, composition: Composition): Promise<RgbaImage> {
  return decodePng(
    await page.screenshot({ omitBackground: composition.background === "transparent" }),
  );
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

/**
 * Per-frame display times in `unitMs` steps. Rounding the running clock
 * rather than each frame keeps the total length exact: 30 fps in GIF's
 * centiseconds becomes 30, 40, 30, 30, 40, ... instead of drifting.
 */
export function frameDelays(totalFrames: number, fps: number, unitMs: number): number[] {
  const at = (frame: number) => Math.round((frame * 1000) / fps / unitMs) * unitMs;
  return Array.from({ length: totalFrames }, (_, frame) => at(frame + 1) - at(frame));
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
    composition,
    async (page) => {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        throwIfCanceled(isCanceled);
        await seekInjectedRuntime(page, timeFromFrame(frame, composition.fps), frame);
        throwIfCanceled(isCanceled);
        await waitForPaint(page);
        const { data } = await screenshotRgba(page, composition);
        frames.push({ rgba: data, durationMs: delays[frame] ?? 0 });
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

export type VideoEncoding = {
  codec: VideoCodec;
  rate: QuantitativeQualityOptions;
};

export function videoEncoding(format: "mp4" | "webm", quality = 80): VideoEncoding {
  if (format === "mp4") {
    return { codec: "avc", rate: { bitrate: 250_000 + quality * 50_000 } };
  }
  // Constant quality, like the previous `-b:v 0 -crf`: 40 at quality 1, 15 at 100.
  return { codec: "vp9", rate: { quantizer: Math.round(40 - (quality - 1) * (25 / 99)) } };
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

async function timelineAudio(
  page: Page | undefined,
  composition: Composition,
  clips: AudioClip[],
  isCanceled: () => boolean,
): Promise<AudioClip[]> {
  if (!page) return clips;
  const wavs = await recordMusicAudio(page, composition.durationSeconds, isCanceled);
  return [...clips, ...wavs.map((wav) => musicClip(wav, composition.durationSeconds))];
}

/**
 * Chromium's screencast emits a frame whenever the compositor presents one.
 * Seeking and then waiting for the next emitted frame captures exactly what
 * the preview painted, including WebGPU canvases that screenshots can miss.
 */
function screencastFrames(session: CDPSession) {
  let latest: Buffer | undefined;
  let sequence = 0;
  let stopped = false;
  const waiters = new Set<{
    afterSequence: number;
    resolve: (frame: Buffer) => void;
    reject: (error: Error) => void;
  }>();
  const onFrame = (event: { data: string; sessionId: number }) => {
    const encoded = Buffer.from(event.data, "base64");
    // ACK immediately. Chromium will not continue the screencast stream
    // while an earlier frame remains unacknowledged.
    void session
      .send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => undefined);
    // A fresh WebGPU page can emit an empty screencast event before its
    // first compositor frame. Skip anything that is not a PNG.
    if (encoded.length < 8 || encoded[0] !== 0x89 || encoded[1] !== 0x50) return;
    sequence += 1;
    latest = encoded;
    for (const waiter of waiters) {
      if (sequence <= waiter.afterSequence) continue;
      waiters.delete(waiter);
      waiter.resolve(encoded);
    }
  };
  session.on("Page.screencastFrame", onFrame);
  return {
    get sequence() {
      return sequence;
    },
    after(afterSequence: number): Promise<Buffer> {
      if (latest !== undefined && sequence > afterSequence) return Promise.resolve(latest);
      if (stopped) {
        return Promise.reject(new AppError("encode_failed", "preview compositor stopped"));
      }
      return new Promise<Buffer>((resolve, reject) => {
        waiters.add({ afterSequence, resolve, reject });
      });
    },
    stop(error: Error) {
      stopped = true;
      session.off("Page.screencastFrame", onFrame);
      for (const waiter of waiters) waiter.reject(error);
      waiters.clear();
    },
  };
}

export type VideoWriter = {
  addFrame(frame: number, image: RgbaImage): Promise<void>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
};

/**
 * Opens an MP4 (H.264/AAC) or WebM (VP9/Opus) file and accepts RGBA frames in
 * order. The optional mix is fed alongside the frames so the muxer can
 * interleave both tracks without buffering either one.
 */
export async function openVideoWriter(
  outputPath: string,
  format: "mp4" | "webm",
  composition: Pick<Composition, "fps" | "durationSeconds">,
  quality?: number,
  pcm?: Pcm,
): Promise<VideoWriter> {
  const output = new Output({
    format: outputFormat(format),
    target: new FilePathTarget(outputPath),
  });
  const encoding = videoEncoding(format, quality);
  const video = new VideoSampleSource({
    codec: encoding.codec,
    quality: new Quality(encoding.rate),
    // Hardware encoders reject small frames and differ per machine.
    hardwareAcceleration: "prefer-software",
    // Screencast frames can arrive at a different size than the viewport;
    // scale them to the composition like the old `-vf scale` did.
    sizeChangeBehavior: "fill",
  });
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
  return {
    async addFrame(frame, image) {
      const sample = new VideoSample(image.data, {
        format: "RGBA",
        codedWidth: image.width,
        codedHeight: image.height,
        timestamp: frame / composition.fps,
        duration: 1 / composition.fps,
      });
      try {
        await video.add(sample);
      } finally {
        sample.close();
      }
      await feedAudio?.((frame + 1) / composition.fps);
    },
    async finish() {
      await feedAudio?.(Infinity);
      await output.finalize();
    },
    async cancel() {
      await output.cancel().catch(() => undefined);
    },
  };
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
  if (job.format !== "mp4" && job.format !== "webm") {
    throw new AppError("invalid_export", `${job.format} is not a video export`);
  }
  const format = job.format;
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const hasMusic = audibleMusicTracks(tracks).length > 0;
  const hasVisualTracks = tracks.some(
    (track) => track.kind === "block" || track.kind === "image" || track.kind === "video",
  );
  const totalFrames = frameCount(composition.durationSeconds, composition.fps);

  await withPage(
    composition,
    async (page) => {
      throwIfCanceled(isCanceled);
      const clips = await timelineAudio(
        hasMusic ? page : undefined,
        composition,
        assetClips(assetsDir, audibleAssetTracks(tracks)),
        isCanceled,
      );
      const pcm =
        clips.length > 0
          ? await mixTimeline(composition.durationSeconds, clips, isCanceled)
          : undefined;
      throwIfCanceled(isCanceled);

      const writer = await openVideoWriter(outputPath, format, composition, job.quality, pcm);
      const session = await page.context().newCDPSession(page);
      const screencast = screencastFrames(session);
      let screencastStarted = false;
      try {
        await seekInjectedRuntime(page, 0, 0);
        await waitForPaint(page);
        let image = await screenshotRgba(page, composition);
        if (hasVisualTracks) {
          await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
          screencastStarted = true;
          // Starting a screencast emits the frame already on screen (frame 0).
          // Consume it first: if it arrived after frame 1's seek, it would be
          // taken as frame 1 and shift the whole video one frame late.
          let settle: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            screencast.after(0),
            new Promise((resolve) => {
              settle = setTimeout(resolve, 2000);
            }),
          ]).finally(() => clearTimeout(settle));
        }
        for (let frame = 0; frame < totalFrames; frame += 1) {
          throwIfCanceled(isCanceled);
          if (frame > 0 && hasVisualTracks) {
            const beforeSeek = screencast.sequence;
            await seekInjectedRuntime(page, timeFromFrame(frame, composition.fps), frame);
            image = decodePng(await screencast.after(beforeSeek));
          }
          throwIfCanceled(isCanceled);
          await writer.addFrame(frame, image);
        }
        throwIfCanceled(isCanceled);
        setEncodingPhase();
        screencast.stop(new AppError("encode_failed", "preview compositor stopped"));
        if (screencastStarted) await session.send("Page.stopScreencast");
        await writer.finish();
      } catch (error) {
        screencast.stop(error instanceof Error ? error : new Error(String(error)));
        if (screencastStarted) {
          await session.send("Page.stopScreencast").catch(() => undefined);
        }
        await writer.cancel();
        throw error;
      }
    },
    loopbackUrl,
  );
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
  let clips = assetClips(assetsDir, audible);
  if (hasMusic) {
    clips = await withPage(
      composition,
      (page) => timelineAudio(page, composition, clips, isCanceled),
      loopbackUrl,
    );
  }
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
