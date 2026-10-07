import { inflateSync } from "node:zlib";
import { CodecError } from "./codec-error.ts";

export type RgbaImage = {
  width: number;
  height: number;
  /** Tightly packed, non-premultiplied RGBA rows. */
  data: Uint8Array<ArrayBuffer>;
};

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Decodes the 8-bit, non-interlaced RGB and RGBA PNGs that Chromium writes for
 * screenshots. Anything else is rejected rather than guessed at.
 */
export function decodePngSync(bytes: Uint8Array): RgbaImage {
  if (signature.some((byte, index) => bytes[index] !== byte)) {
    throw new CodecError("capture_failed", "screenshot is not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed: Uint8Array[] = [];
  let offset = signature.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [bitDepth, colorType, , , interlace] = body.subarray(8, 13);
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
      if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
        throw new CodecError("capture_failed", "screenshot PNG uses an unsupported pixel format");
      }
    } else if (type === "IDAT") {
      compressed.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0) {
    throw new CodecError("capture_failed", "screenshot PNG has no image header");
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (filtered.length < (stride + 1) * height) {
    throw new CodecError("capture_failed", "screenshot PNG is truncated");
  }
  const rows = unfilter(filtered, stride, height, channels);
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < rows.length; source += 3, target += 4) {
    data[target] = rows[source] ?? 0;
    data[target + 1] = rows[source + 1] ?? 0;
    data[target + 2] = rows[source + 2] ?? 0;
    data[target + 3] = 255;
  }
  return { width, height, data };
}

function unfilter(
  filtered: Uint8Array,
  stride: number,
  height: number,
  bpp: number,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[source + x] ?? 0;
      const left = x >= bpp ? (out[row + x - bpp] ?? 0) : 0;
      const up = y > 0 ? (out[previous + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bpp ? (out[previous + x - bpp] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paeth(left, up, upLeft);
      else if (filter !== 0) {
        throw new CodecError("capture_failed", "screenshot PNG has an invalid row filter");
      }
      out[row + x] = (raw + predicted) & 0xff;
    }
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}
