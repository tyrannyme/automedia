import { describe, expect, it } from "vitest";
import { mapMissingBinaryError } from "./errors.ts";

describe("mapMissingBinaryError", () => {
  it("maps spawn ffmpeg ENOENT to a health error", () => {
    const error = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    expect(mapMissingBinaryError(error)).toMatchObject({ code: "ffmpeg_unavailable" });
  });

  it("maps spawn ffprobe ENOENT to a health error", () => {
    const error = Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
    expect(mapMissingBinaryError(error)).toMatchObject({ code: "ffprobe_unavailable" });
  });

  it("does not treat a missing composition file as ffmpeg", () => {
    const error = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    expect(mapMissingBinaryError(error)).toBeNull();
  });
});
