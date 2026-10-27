import { describe, expect, it } from "vitest";
import { orderedFrames } from "./export-capture.ts";
import { farmWorkers } from "./frame-farm.ts";

function image(frame: number): Uint8Array {
  return new Uint8Array([frame]);
}

describe("video capture", () => {
  it("uses one capture browser per two cores and gigabyte, up to sixteen", () => {
    const plenty = 64 * 2 ** 30;
    expect(farmWorkers(1, plenty)).toBe(1);
    expect(farmWorkers(24, plenty)).toBe(12);
    expect(farmWorkers(64, plenty)).toBe(16);
    expect(farmWorkers(24, 6 * 2 ** 30)).toBe(6);
  });

  it("writes frames captured out of order in order", async () => {
    const written: number[] = [];
    const frames = orderedFrames<Uint8Array>(async (frame, jpeg) => {
      expect(jpeg[0]).toBe(frame);
      written.push(frame);
    }, 4);
    for (const frame of [2, 0, 3, 1, 4]) frames.put(frame, image(frame));
    await frames.finish();
    expect(written).toEqual([0, 1, 2, 3, 4]);
  });

  it("holds a capture back until the writer is within the window", async () => {
    const frames = orderedFrames(async () => undefined, 2);
    let roomForTwo = false;
    const waiting = frames.room(2).then(() => {
      roomForTwo = true;
    });
    await frames.room(1);
    frames.put(1, image(1));
    await Promise.resolve();
    expect(roomForTwo).toBe(false);
    frames.put(0, image(0));
    await waiting;
    expect(roomForTwo).toBe(true);
  });

  it("stops every waiting capture once one fails", async () => {
    const frames = orderedFrames(async () => undefined, 1);
    const waiting = frames.room(5);
    frames.fail(new Error("page crashed"));
    await expect(waiting).rejects.toThrow("page crashed");
    await expect(frames.room(0)).rejects.toThrow("page crashed");
  });

  it("fails when a write fails", async () => {
    const frames = orderedFrames(async () => {
      throw new Error("encoder failed");
    }, 2);
    frames.put(0, image(0));
    await expect(frames.finish()).rejects.toThrow("encoder failed");
    await expect(frames.room(1)).rejects.toThrow("encoder failed");
  });
});
