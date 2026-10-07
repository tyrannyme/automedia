import { AppError } from "@shared/errors.ts";
import { loadWebp, maxAnimatedWebpBytes, type AnimationFrame } from "./animation-encode.ts";
import { encodeAnimationOffThread } from "./codecs.ts";
import type { RgbaImage } from "./png-decode.ts";

export { maxAnimatedWebpBytes, type AnimationFrame };

/**
 * Encodes a looping GIF with one palette built from every frame, on a codec
 * worker. Takes ownership of the frames: their pixels move to the worker.
 */
export function encodeGif(
  width: number,
  height: number,
  frames: readonly AnimationFrame[],
): Promise<Uint8Array> {
  return encodeAnimationOffThread({ format: "gif", width, height, frames, quality: undefined });
}

/**
 * Encodes an animated, lossless WebP on a codec worker. `quality` is
 * libwebp's lossless effort (0-100). Takes ownership of the frames.
 */
export function encodeAnimatedWebp(
  width: number,
  height: number,
  frames: readonly AnimationFrame[],
  quality = 75,
): Promise<Uint8Array> {
  return encodeAnimationOffThread({ format: "webp", width, height, frames, quality });
}

/** Decodes the first frame of a still or animated WebP. */
export async function decodeWebp(bytes: Uint8Array): Promise<RgbaImage> {
  const webp = await loadWebp();
  // wasm-webp's decodeRGBA returns a view into freed wasm memory, so read
  // through the animation decoder even for single-frame files.
  const first = webp.decodeAnimation(bytes, true)?.[0];
  if (!first) {
    throw new AppError("probe_failed", "WebP could not be decoded");
  }
  return { width: first.width, height: first.height, data: first.data.slice() };
}
