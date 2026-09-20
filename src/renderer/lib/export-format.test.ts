import { describe, expect, it } from "vitest";
import {
  exportFormatDisabled,
  exportFormatGroups,
  exportFormatHelper,
  exportFormatLabel,
} from "./export-format.ts";

describe("exportFormatDisabled", () => {
  it("keeps PNG when ffmpeg is missing", () => {
    expect(exportFormatDisabled("png", { oddSize: false, ffmpegReady: false })).toBe(false);
  });

  it("blocks encoded formats when ffmpeg is missing", () => {
    expect(exportFormatDisabled("mp4", { oddSize: false, ffmpegReady: false })).toBe(true);
    expect(exportFormatDisabled("webm", { oddSize: false, ffmpegReady: false })).toBe(true);
    expect(exportFormatDisabled("gif", { oddSize: false, ffmpegReady: false })).toBe(true);
    expect(exportFormatDisabled("mp3", { oddSize: false, ffmpegReady: false })).toBe(true);
    expect(exportFormatDisabled("wav", { oddSize: false, ffmpegReady: false })).toBe(true);
    expect(exportFormatDisabled("ogg", { oddSize: false, ffmpegReady: false })).toBe(true);
  });

  it("names formats in Poppins-facing copy", () => {
    expect(exportFormatLabel("mp4")).toBe("MP4");
    expect(exportFormatLabel("webm")).toBe("WebM");
    expect(exportFormatLabel("png")).toBe("PNG");
    expect(exportFormatLabel("mp3")).toBe("MP3");
    expect(exportFormatLabel("wav")).toBe("WAV");
    expect(exportFormatLabel("ogg")).toBe("OGG");
  });

  it("blocks odd MP4 even when ffmpeg is healthy", () => {
    expect(exportFormatDisabled("mp4", { oddSize: true, ffmpegReady: true })).toBe(true);
    expect(exportFormatDisabled("png", { oddSize: true, ffmpegReady: true })).toBe(false);
    expect(exportFormatDisabled("wav", { oddSize: true, ffmpegReady: true })).toBe(false);
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
