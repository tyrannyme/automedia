import { Encoder as GifEncoder } from "modern-gif";
import createWebpModule, { type WebpModule } from "wasm-webp/dist/esm/webp-wasm.js";
import { CodecError } from "./codec-error.ts";

/** Runs on codec workers: encoding a long animation takes seconds of CPU. */

export type AnimationFrame = {
  /** Non-premultiplied RGBA at the animation size. */
  rgba: Uint8Array<ArrayBuffer>;
  durationMs: number;
};

/**
 * Encodes a looping GIF with one palette built from every frame, like the old
 * `palettegen=stats_mode=full`. GIF stores delays in centiseconds, so
 * durations should be multiples of 10.
 */
export async function encodeGif(
  width: number,
  height: number,
  frames: readonly AnimationFrame[],
): Promise<Uint8Array> {
  const encoder = new GifEncoder({ width, height, looped: true });
  for (const frame of frames) {
    await encoder.encode({ data: binaryAlpha(frame.rgba), delay: frame.durationMs });
  }
  return new Uint8Array(await encoder.flush());
}

/**
 * GIF has no partial transparency. Like FFmpeg's `paletteuse` (threshold
 * 128), pixels at least half opaque keep their color at full opacity and the
 * rest become transparent. modern-gif would otherwise blend them onto white.
 */
function binaryAlpha(rgba: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba);
  for (let alpha = 3; alpha < out.length; alpha += 4) {
    out[alpha] = (out[alpha] ?? 0) >= 128 ? 255 : 0;
  }
  return out;
}

/**
 * libwebp's animation encoder takes every frame at once, and the wasm build
 * caps its heap at 2 GiB. Leave room for the encoder's own buffers.
 */
export const maxAnimatedWebpBytes = 1.5 * 1024 ** 3;

let webpModule: Promise<WebpModule> | undefined;

export function loadWebp(): Promise<WebpModule> {
  const loaded = webpModule ?? createWebpModule();
  webpModule = loaded;
  return loaded;
}

/**
 * Encodes an animated, lossless WebP. `quality` is libwebp's lossless effort
 * (0-100), matching the old `-lossless 1 -quality` export.
 */
export async function encodeAnimatedWebp(
  width: number,
  height: number,
  frames: readonly AnimationFrame[],
  quality = 75,
): Promise<Uint8Array> {
  const webp = await loadWebp();
  const vector = new webp.VectorWebPAnimationFrame();
  try {
    for (const frame of frames) {
      vector.push_back({
        data: frame.rgba,
        duration: frame.durationMs,
        config: { lossless: 1, quality },
        has_config: true,
      });
    }
    const encoded = webp.encodeAnimation(width, height, true, vector);
    if (!encoded || encoded.length === 0) {
      throw new CodecError("encode_failed", "WebP encoder produced no output");
    }
    return encoded.slice();
  } finally {
    vector.delete();
  }
}
