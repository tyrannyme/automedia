import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeFrames } from "modern-gif";
import { AppError } from "@shared/errors.ts";
import { ALL_FORMATS, FilePathSource, Input, VideoSampleSink } from "./mediabunny.ts";
import { decodePng } from "./png.ts";
import { decodeWebp } from "./animation.ts";

/**
 * Decodes a PNG, GIF, WebP, MP4, or WebM file to RGBA. Images yield their
 * first frame; videos yield the frame shown at `timeSeconds`.
 */
export async function decodeRgba(filePath: string, timeSeconds?: number): Promise<Buffer> {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (extension === "mp4" || extension === "webm") {
    return decodeVideoFrame(filePath, timeSeconds);
  }
  const bytes = await readFile(filePath);
  if (extension === "png") return Buffer.from(decodePng(bytes).data);
  if (extension === "webp") return Buffer.from((await decodeWebp(bytes)).data);
  if (extension === "gif") {
    const [first] = decodeFrames(bytes, { range: [0, 0] });
    if (!first) throw new AppError("probe_failed", "GIF has no frames");
    return Buffer.from(first.data);
  }
  throw new AppError("probe_failed", `cannot decode .${extension} pixels`);
}

async function decodeVideoFrame(filePath: string, timeSeconds?: number): Promise<Buffer> {
  using input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new AppError("probe_failed", "video has no video track");
  using sample = await new VideoSampleSink(track).getSample(
    timeSeconds ?? (await track.getFirstTimestamp()),
  );
  if (!sample) throw new AppError("probe_failed", "video has no frames");
  const rgba = Buffer.alloc(sample.allocationSize({ format: "RGBA" }));
  await sample.copyTo(rgba, { format: "RGBA" });
  return rgba;
}

export function pixel(
  rgba: Buffer,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0, rgba[offset + 3] ?? 0];
}
