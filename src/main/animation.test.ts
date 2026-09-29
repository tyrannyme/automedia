import { decode, decodeFrames } from "modern-gif";
import { describe, expect, it } from "vitest";
import { decodeWebp, encodeAnimatedWebp, encodeGif, type AnimationFrame } from "./animation.ts";

const width = 8;
const height = 8;

/** Left half opaque `color`, right half fully transparent. */
function halfFrame(color: [number, number, number], durationMs: number): AnimationFrame {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width / 2; x += 1) {
      rgba.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { rgba, durationMs };
}

const frames = [halfFrame([220, 30, 60], 30), halfFrame([20, 200, 90], 40)];

describe("encodeGif", () => {
  it("writes a looping GIF with per-frame delays and transparency", async () => {
    const gif = await encodeGif(width, height, frames);
    const info = decode(gif);
    expect(info).toMatchObject({ width, height, looped: true });
    expect(info.frames.map((frame) => frame.delay)).toEqual([30, 40]);
    const [first, second] = decodeFrames(gif);
    expect([...(first?.data.subarray(0, 4) ?? [])]).toEqual([220, 30, 60, 255]);
    expect(first?.data[(width - 1) * 4 + 3]).toBe(0);
    expect([...(second?.data.subarray(0, 4) ?? [])]).toEqual([20, 200, 90, 255]);
  });
  it("keeps half-opaque pixels at full color and drops fainter ones", async () => {
    const rgba = new Uint8Array(width * height * 4);
    for (let x = 0; x < width; x += 1) {
      rgba.set(x === 1 ? [0, 0, 255, 127] : [255, 0, 0, 128], x * 4);
      rgba.set([0, 255, 0, 255], (width + x) * 4);
    }
    const [frame] = decodeFrames(await encodeGif(width, height, [{ rgba, durationMs: 100 }]));
    expect([...(frame?.data.subarray(0, 4) ?? [])]).toEqual([255, 0, 0, 255]);
    expect(frame?.data[7]).toBe(0);
  });
});

describe("encodeAnimatedWebp", () => {
  it("writes a lossless animated WebP that keeps alpha", async () => {
    const webp = await encodeAnimatedWebp(width, height, frames, 80);
    const header = Buffer.from(webp);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WEBP");
    expect(header.includes(Buffer.from("ANIM"))).toBe(true);
    const first = await decodeWebp(webp);
    expect(first).toMatchObject({ width, height });
    expect([...first.data.subarray(0, 4)]).toEqual([220, 30, 60, 255]);
    expect(first.data[(width - 1) * 4 + 3]).toBe(0);
  });
});
