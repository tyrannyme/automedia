import { describe, expect, it } from "vitest";
import { friendlyMediaError, LIBRARY_ASSET_MIME } from "./library-drag.ts";

describe("friendlyMediaError", () => {
  it("keeps the ffmpeg health message", () => {
    const error = Object.assign(new Error("ffmpeg is not installed or not on PATH."), {
      code: "ffmpeg_unavailable",
    });
    expect(friendlyMediaError(error)).toContain("ffmpeg is not installed");
  });

  it("rewrites a generic probe failure", () => {
    const error = Object.assign(new Error("spawn ffprobe ENOENT"), { code: "probe_failed" });
    expect(friendlyMediaError(error)).toBe("Could not read this media file.");
  });
});

describe("library drag mime", () => {
  it("uses a private asset mime type", () => {
    expect(LIBRARY_ASSET_MIME).toBe("application/x-automedia-asset");
  });
});
