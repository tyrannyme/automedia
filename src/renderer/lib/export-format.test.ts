import { describe, expect, it } from "vitest";
import {
  exportFormatDisabled,
  exportFormatGroups,
  exportFormatHelper,
  exportFormatLabel,
  videoExportBlock,
} from "./export-format.ts";

describe("exportFormatDisabled", () => {
  it("enables every format when video is not blocked", () => {
    for (const format of ["png", "gif", "webp", "mp4", "webm", "mp3", "wav", "ogg"] as const) {
      expect(exportFormatDisabled(format, { videoBlocked: false })).toBe(false);
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

  it("blocks MP4 and WebM only", () => {
    expect(exportFormatDisabled("mp4", { videoBlocked: true })).toBe(true);
    expect(exportFormatDisabled("webm", { videoBlocked: true })).toBe(true);
    expect(exportFormatDisabled("png", { videoBlocked: true })).toBe(false);
    expect(exportFormatDisabled("wav", { videoBlocked: true })).toBe(false);
  });

  it("names why video export is blocked", () => {
    const opaque = { width: 800, height: 600, background: "#000000" };
    expect(videoExportBlock(null)).toBeNull();
    expect(videoExportBlock(opaque)).toBeNull();
    expect(videoExportBlock({ ...opaque, background: "transparent" })).toContain(
      "opaque background",
    );
    expect(videoExportBlock({ ...opaque, width: 801 })).toContain("even width and height");
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
