import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeFrames } from "modern-gif";
import { AppError } from "@shared/errors.ts";
import { Decoder, Demuxer, FilterAPI, type Frame } from "node-av";
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

/**
 * The frame shown at `timeSeconds`, converted the way players convert it:
 * with the matrix and range the video is tagged with.
 */
async function decodeVideoFrame(filePath: string, timeSeconds?: number): Promise<Buffer> {
  await using input = await Demuxer.open(filePath);
  const stream = input.video();
  if (!stream) throw new AppError("probe_failed", "video has no video track");
  using decoder = await Decoder.create(stream);
  using toRgba = FilterAPI.create("scale=flags=accurate_rnd+full_chroma_int,format=rgba");
  const seconds = (frame: Frame) => (Number(frame.pts) * stream.timeBase.num) / stream.timeBase.den;
  let shown: Frame | null = null;
  try {
    for await (const frame of decoder.frames(input.packets(stream.index))) {
      if (!frame) break;
      if (shown && timeSeconds !== undefined && seconds(frame) > timeSeconds + 1e-6) break;
      shown?.free();
      shown = frame.clone();
      if (timeSeconds === undefined) break;
    }
    if (!shown) throw new AppError("probe_failed", "video has no frames");
    const [rgba] = await toRgba.processAll(shown);
    if (!rgba) throw new AppError("probe_failed", "video frame did not convert");
    const pixels = rgba.toBuffer();
    rgba.free();
    return pixels;
  } finally {
    shown?.free();
  }
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
