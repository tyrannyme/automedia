import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng } from "./png.ts";

function chunk(type: string, body: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");
  // Chromium's CRCs are not checked by the decoder, so zero is fine here.
  return Buffer.concat([header, body, Buffer.alloc(4)]);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Encodes rows with the given filter per row, the inverse of PNG unfiltering. */
function encodePng(
  width: number,
  channels: 3 | 4,
  rows: number[][],
  filters: readonly number[],
): Buffer {
  const stride = width * channels;
  const raw: number[] = [];
  for (const [y, row] of rows.entries()) {
    const filter = filters[y] ?? 0;
    raw.push(filter);
    for (let x = 0; x < stride; x += 1) {
      const value = row[x] ?? 0;
      const left = x >= channels ? (row[x - channels] ?? 0) : 0;
      const up = rows[y - 1]?.[x] ?? 0;
      const upLeft = x >= channels ? (rows[y - 1]?.[x - channels] ?? 0) : 0;
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
      raw.push((value - predicted) & 0xff);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", new Uint8Array()),
  ]);
}

describe("decodePng", () => {
  it("undoes every row filter for RGBA screenshots", () => {
    const rows = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 3 * 4 }, (_value, x) => (x * 37 + y * 91 + 13) & 0xff),
    );
    const image = decodePng(encodePng(3, 4, rows, [0, 1, 2, 3, 4]));
    expect(image.width).toBe(3);
    expect(image.height).toBe(5);
    expect([...image.data]).toEqual(rows.flat());
  });

  it("expands opaque RGB screenshots to RGBA", () => {
    const image = decodePng(encodePng(2, 3, [[10, 20, 30, 40, 50, 60]], [4]));
    expect([...image.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("rejects bytes that are not a PNG", () => {
    expect(() => decodePng(Buffer.from("GIF89a"))).toThrow(/not a PNG/);
  });
});
