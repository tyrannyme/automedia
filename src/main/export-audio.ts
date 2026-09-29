import path from "node:path";
import { throwIfCanceled } from "@shared/errors.ts";
import type { ExportFormat, MediaTrack } from "@shared/schemas.ts";
import {
  AudioSample,
  AudioSampleSource,
  BufferSource,
  Conversion,
  ConversionCanceledError,
  FilePathSource,
  Input,
  NullTarget,
  Output,
  WavOutputFormat,
  ALL_FORMATS,
  type AudioCodec,
  type QuantitativeQualityOptions,
  type Source,
} from "./mediabunny.ts";

export const mixSampleRate = 48_000;
export const mixChannels = 2;

/** Planar float PCM at {@link mixSampleRate}, one array per channel. */
export type Pcm = Float32Array[];

/** One source placed on the export timeline. */
export type AudioClip = {
  source: Source;
  /** Source seconds to skip before the clip starts. */
  trimStart: number;
  /** Timeline seconds the clip occupies. */
  duration: number;
  /** Playback rate. Rates other than 1 time-stretch without changing pitch. */
  rate: number;
  volume: number;
  /** Timeline second where the clip starts. */
  start: number;
};

export function assetClips(assetsDir: string, tracks: readonly MediaTrack[]): AudioClip[] {
  return tracks.map((track) => ({
    source: new FilePathSource(path.join(assetsDir, track.asset)),
    trimStart: track.trimStart,
    duration: track.duration,
    rate: track.rate,
    volume: track.volume,
    start: track.start,
  }));
}

/** Recorded music plays from the start of the timeline at unity gain. */
export function musicClip(wav: Uint8Array, durationSeconds: number): AudioClip {
  return {
    source: new BufferSource(wav),
    trimStart: 0,
    duration: durationSeconds,
    rate: 1,
    volume: 1,
    start: 0,
  };
}

/**
 * Renders every clip onto one stereo timeline of `durationSeconds`. Clips are
 * trimmed, time-stretched, gained, offset, padded with silence, and cut at
 * the composition end. Several clips are averaged, as FFmpeg's `amix` did, so
 * mixing never clips harder than any single source.
 */
export async function mixTimeline(
  durationSeconds: number,
  clips: readonly AudioClip[],
  isCanceled: () => boolean = () => false,
): Promise<Pcm> {
  const length = Math.round(durationSeconds * mixSampleRate);
  const mix = Array.from({ length: mixChannels }, () => new Float32Array(length));
  const gain = clips.length > 1 ? 1 / clips.length : 1;
  for (const clip of clips) {
    throwIfCanceled(isCanceled);
    const decoded = await decodeClip(clip, isCanceled);
    const stretched = timeStretch(decoded, clip.rate);
    const offset = Math.round(clip.start * mixSampleRate);
    const clipLength = Math.min(
      Math.round(clip.duration * mixSampleRate),
      stretched[0]?.length ?? 0,
      length - offset,
    );
    for (const [channel, target] of mix.entries()) {
      const source = stretched[channel] ?? stretched[0];
      if (!source) continue;
      const scale = clip.volume * gain;
      for (let index = 0; index < clipLength; index += 1) {
        target[offset + index] = (target[offset + index] ?? 0) + (source[index] ?? 0) * scale;
      }
    }
  }
  return mix;
}

/** Decodes the clip's source range as stereo PCM at the mix sample rate. */
async function decodeClip(clip: AudioClip, isCanceled: () => boolean): Promise<Pcm> {
  using input = new Input({ source: clip.source, formats: ALL_FORMATS });
  const chunks: Pcm[] = [];
  const conversion: Conversion = await Conversion.init({
    input,
    output: new Output({ format: new WavOutputFormat(), target: new NullTarget() }),
    tracks: "primary",
    video: { discard: true },
    audio: {
      numberOfChannels: mixChannels,
      sampleRate: mixSampleRate,
      codec: "pcm-f32",
      process: (sample) => {
        if (isCanceled()) void conversion.cancel();
        chunks.push(samplePlanes(sample));
        return sample;
      },
    },
    trim: { start: clip.trimStart, end: clip.trimStart + clip.duration * clip.rate },
    copy: false,
    showWarnings: false,
  });
  if (conversion.utilizedTracks.length === 0) return [];
  try {
    await conversion.execute();
  } catch (error) {
    if (error instanceof ConversionCanceledError) throwIfCanceled(isCanceled);
    throw error;
  }
  return concatPcm(chunks);
}

function samplePlanes(sample: AudioSample): Pcm {
  return Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex, format: "f32-planar" });
    return plane;
  });
}

function concatPcm(chunks: readonly Pcm[]): Pcm {
  const channels = chunks[0]?.length ?? 0;
  const length = chunks.reduce((sum, chunk) => sum + (chunk[0]?.length ?? 0), 0);
  return Array.from({ length: channels }, (_, channel) => {
    const out = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      const plane = chunk[channel] ?? new Float32Array(chunk[0]?.length ?? 0);
      out.set(plane, offset);
      offset += plane.length;
    }
    return out;
  });
}

const stretchWindow = 1536;
const stretchHop = stretchWindow / 2;
const stretchSearch = 384;
const stretchWeights = Float32Array.from(
  { length: stretchWindow },
  (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / stretchWindow),
);

/**
 * Changes duration by `1 / rate` while keeping pitch, using WSOLA: Hann
 * windows overlap-added at a fixed output hop, each taken from near its
 * nominal input position where it best continues the previous window.
 */
export function timeStretch(pcm: Pcm, rate: number): Pcm {
  const inputLength = pcm[0]?.length ?? 0;
  if (rate === 1 || inputLength === 0) return pcm;
  const outputLength = Math.round(inputLength / rate);
  const mono = new Float32Array(inputLength + stretchWindow);
  for (const plane of pcm) {
    for (let index = 0; index < inputLength; index += 1) {
      mono[index] = (mono[index] ?? 0) + (plane[index] ?? 0) / pcm.length;
    }
  }
  const out = pcm.map(() => new Float32Array(outputLength + stretchWindow));
  const lastStart = Math.max(0, inputLength - stretchWindow);
  let previous = 0;
  for (let frame = 0; frame * stretchHop < outputLength; frame += 1) {
    const nominal = Math.min(lastStart, Math.round(frame * stretchHop * rate));
    const position = frame === 0 ? 0 : bestOverlap(mono, previous + stretchHop, nominal, lastStart);
    const outputStart = frame * stretchHop;
    for (const [channel, plane] of pcm.entries()) {
      const target = out[channel];
      if (!target) continue;
      for (let index = 0; index < stretchWindow; index += 1) {
        const value = plane[position + index] ?? 0;
        target[outputStart + index] =
          (target[outputStart + index] ?? 0) + value * (stretchWeights[index] ?? 0);
      }
    }
    previous = position;
  }
  return out.map((plane) => plane.subarray(0, outputLength));
}

/** Finds the input offset near `nominal` that best matches the natural continuation. */
function bestOverlap(mono: Float32Array, continuation: number, nominal: number, last: number) {
  const from = Math.max(0, nominal - stretchSearch);
  const to = Math.min(last, nominal + stretchSearch);
  let best = Math.min(Math.max(nominal, from), to);
  let bestScore = -Infinity;
  for (let candidate = from; candidate <= to; candidate += 2) {
    let score = 0;
    for (let index = 0; index < stretchHop; index += 2) {
      score += (mono[candidate + index] ?? 0) * (mono[continuation + index] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export type AudioExportFormat = Extract<ExportFormat, "mp4" | "webm" | "mp3" | "wav" | "ogg">;

export type AudioEncoding = {
  codec: AudioCodec;
  /** Absent for PCM, which has no rate control. */
  rate?: QuantitativeQualityOptions;
};

/** Codec and rate control per export format; matches the previous FFmpeg settings. */
export function audioEncoding(format: AudioExportFormat, quality = 80): AudioEncoding {
  if (format === "mp4") return { codec: "aac", rate: { bitrate: 192_000 } };
  if (format === "webm") return { codec: "opus", rate: { bitrate: 160_000 } };
  if (format === "mp3") {
    return { codec: "mp3", rate: { bitrate: 64_000 + Math.round((quality - 1) * (256_000 / 99)) } };
  }
  if (format === "ogg") {
    // Vorbis -q:a 0..10 spans roughly 64-500 kbps.
    const bitrate = 64_000 + Math.round((quality - 1) * (436_000 / 99));
    return { codec: "vorbis", rate: { bitrate, bitrateMode: "variable" } };
  }
  return { codec: "pcm-s16" };
}

/** Feeds a rendered mix to an encoder in order, one second at a time. */
export function audioFeeder(source: AudioSampleSource, pcm: Pcm) {
  const length = pcm[0]?.length ?? 0;
  let written = 0;
  return async (untilSeconds: number): Promise<void> => {
    const until = Math.min(length, Math.round(untilSeconds * mixSampleRate));
    while (written < until) {
      const count = Math.min(mixSampleRate, until - written);
      const data = new Float32Array(count * pcm.length);
      for (const [channel, plane] of pcm.entries()) {
        data.set(plane.subarray(written, written + count), channel * count);
      }
      const sample = new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: pcm.length,
        sampleRate: mixSampleRate,
        timestamp: written / mixSampleRate,
      });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
      written += count;
    }
  };
}
