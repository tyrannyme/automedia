import { describe, expect, it } from "vitest";
import { pixel } from "./rgba.ts";

describe("pixel", () => {
  it("reads RGBA at a coordinate", () => {
    const rgba = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(pixel(rgba, 2, 0, 0)).toEqual([1, 2, 3, 4]);
    expect(pixel(rgba, 2, 1, 1)).toEqual([13, 14, 15, 16]);
  });
});
