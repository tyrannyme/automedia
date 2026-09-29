import { describe, expect, it } from "vitest";
import {
  exportFormatDisabled,
  exportFormatGroups,
  exportFormatHelper,
  exportFormatLabel,
} from "./export-format.ts";

describe("exportFormatDisabled", () => {
  it("enables every format for even sizes", () => {
    for (const format of ["png", "gif", "webp", "mp4", "webm", "mp3", "wav", "ogg"] as const) {
      expect(exportFormatDisabled(format, { oddSize: false })).toBe(false);
    }
  });

  it("names formats in Poppins-facing copy", () => {
    expect(exportFormatLabel("mp4")).toBe("MP4");
    expect(exportFormatLabel("webm")).toBe("WebM");
    expect(exportFormatLabel("png")).toBe("PNG");
    expect(exportFormatLabel("mp3")).toBe("MP3");
    expect(exportFormatLabel("wav")).toBe("WAV");
    expect(exportFormatLabel("ogg")).toBe("OGG");
  });

  it("blocks odd MP4 and WebM only", () => {
    expect(exportFormatDisabled("mp4", { oddSize: true })).toBe(true);
    expect(exportFormatDisabled("webm", { oddSize: true })).toBe(true);
    expect(exportFormatDisabled("png", { oddSize: true })).toBe(false);
    expect(exportFormatDisabled("wav", { oddSize: true })).toBe(false);
  });

  it("groups formats so the dialog can keep eight names on three rows", () => {
    expect(exportFormatGroups.map((group) => group.label)).toEqual(["Video", "Still", "Audio"]);
    expect(exportFormatGroups.flatMap((group) => [...group.formats])).toEqual([
      "mp4",
      "webm",
      "png",
      "gif",
      "webp",
      "mp3",
      "wav",
      "ogg",
    ]);
    expect(exportFormatHelper("wav")).toContain("Unmuted audio");
    expect(exportFormatHelper("mp4")).toBeUndefined();
  });
});
