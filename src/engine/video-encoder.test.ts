import {
  AV_PICTURE_TYPE_I,
  AV_PICTURE_TYPE_NONE,
  AV_PIX_FMT_YUV420P,
  FFmpegError,
  Frame,
} from "node-av";
import { describe, expect, it } from "vitest";
import { openFrameEncoder } from "./video-encoder.ts";

const width = 320;
const height = 240;
const fps = 30;

/**
 * Bytes of video for a second of a moving gradient under fine grain, like
 * detailed footage: a low quality smooths the grain away, a high one keeps it.
 * Frames come marked as I pictures, as the capture's JPEG decoder leaves them.
 */
async function encodedBytes(
  format: "mp4" | "webm",
  quality: number,
  pictType = AV_PICTURE_TYPE_I,
): Promise<number> {
  const encoder = await openFrameEncoder(format, quality, width, height, fps);
  const pixels = Buffer.alloc((width * height * 3) / 2);
  let seed = 1;
  let bytes = 0;
  try {
    for (let index = 0; index < fps; index += 1) {
      for (let at = 0; at < pixels.length; at += 1) {
        seed = (seed * 1_103_515_245 + 12_345) >>> 0;
        const x = at < width * height ? at % width : at % (width / 2);
        pixels[at] = 64 + ((x + index * 4) % 128) + (seed >>> 29);
      }
      const frame = new Frame();
      frame.alloc();
      frame.format = AV_PIX_FMT_YUV420P;
      frame.width = width;
      frame.height = height;
      frame.pictType = pictType;
      FFmpegError.throwIfError(frame.allocBuffer(), "allocate a frame");
      FFmpegError.throwIfError(frame.fromBuffer(pixels), "fill a frame");
      for (const packet of await encoder.encode(frame)) bytes += packet.data.byteLength;
    }
    for (const packet of await encoder.flush()) bytes += packet.data.byteLength;
  } finally {
    encoder.close();
  }
  return bytes;
}

describe("video encoder", () => {
  it.each(["mp4", "webm"] as const)("spends more bits at a higher %s quality", async (format) => {
    const low = await encodedBytes(format, 10);
    const high = await encodedBytes(format, 100);
    expect(high).toBeGreaterThan(low * 3);
  });

  it.each(["mp4", "webm"] as const)(
    "codes captured %s frames against the ones before them",
    async (format) => {
      const captured = await encodedBytes(format, 50);
      const unmarked = await encodedBytes(format, 50, AV_PICTURE_TYPE_NONE);
      expect(captured).toBeLessThan(unmarked * 1.1);
    },
  );
});
