import { describe, expect, it } from "vitest";
import { CLIP_SWATCHES, clipInk, nextClipColor } from "./clip-color.ts";

describe("clip color", () => {
  it("picks the first unused swatch", () => {
    expect(nextClipColor([])).toBe(CLIP_SWATCHES[0]);
    expect(nextClipColor([{ kind: "block", color: CLIP_SWATCHES[0] }])).toBe(CLIP_SWATCHES[1]);
  });

  it("cycles when every swatch is taken", () => {
    const tracks = CLIP_SWATCHES.map((color) => ({ kind: "block" as const, color }));
    expect(nextClipColor(tracks)).toBe(CLIP_SWATCHES[0]);
  });

  it("picks dark ink on light yellow", () => {
    expect(clipInk("#EAB308")).toBe("#0A0A0A");
    expect(clipInk("#3B82F6")).toBe("#F5F5F5");
  });
});
