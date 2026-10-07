import { AppError } from "@shared/errors.ts";
import { ALL_FORMATS, FilePathSource, Input, type InputTrack } from "./mediabunny.ts";

export type MediaStream = {
  codecType: "audio" | "video" | "subtitle";
  /** Mediabunny codec id, such as `avc`, `vp9`, `aac`, `opus`, or `pcm-s16`. */
  codecName: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
};

export type ProbeResult = {
  /** Mediabunny container name, such as `MP4`, `WebM`, `Ogg`, or `WAVE`. */
  formatName: string;
  durationSeconds: number;
  streams: MediaStream[];
};

export async function probeFile(filePath: string): Promise<ProbeResult> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  try {
    const format = await input.getFormat();
    const tracks = await input.getTracks();
    const streams = await Promise.all(tracks.map(probeTrack));
    const durationSeconds = tracks.length > 0 ? await input.computeDuration() : 0;
    return { formatName: format.name, durationSeconds, streams };
  } catch (error) {
    throw new AppError(
      "probe_failed",
      error instanceof Error && error.message.length > 0 ? error.message : "media probe failed",
    );
  }
}

async function probeTrack(track: InputTrack): Promise<MediaStream> {
  const stream: MediaStream = {
    codecType: track.type,
    codecName: track.codec ?? "",
    durationSeconds: await track.computeDuration(),
  };
  if (track.isVideoTrack()) {
    stream.width = track.displayWidth;
    stream.height = track.displayHeight;
    const { bestGuessFrameRate } = await track.computeFrameRateMetrics();
    if (Number.isFinite(bestGuessFrameRate) && bestGuessFrameRate > 0) {
      stream.fps = bestGuessFrameRate;
    }
  }
  return stream;
}
