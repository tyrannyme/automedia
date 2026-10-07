import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeFile } from "./probe.ts";

describe("probeFile", () => {
  it("returns codec, dimensions, duration, and frame rate for video streams", async () => {
    const result = await probeFile(path.resolve("fixtures/fps-guns.mp4"));
    expect(result.formatName).toBe("MP4");
    expect(result.durationSeconds).toBeCloseTo(2.48, 2);
    expect(result.streams[0]).toMatchObject({
      codecType: "video",
      codecName: "avc",
      width: 960,
      height: 540,
      fps: 25,
    });
    expect(result.streams[0]?.durationSeconds).toBeCloseTo(2.48, 2);
  });

  it("returns container and codec for audio-only files", async () => {
    const result = await probeFile(path.resolve("fixtures/beat-ident.ogg"));
    expect(result.formatName).toBe("Ogg");
    expect(result.streams).toHaveLength(1);
    expect(result.streams[0]).toMatchObject({ codecType: "audio", codecName: "vorbis" });
    expect(result.durationSeconds).toBeGreaterThan(4.9);
  });

  it("reports unreadable files as probe failures", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-probe-"));
    try {
      const filePath = path.join(dir, "noise.mp4");
      await writeFile(filePath, "not a media file");
      await expect(probeFile(filePath)).rejects.toMatchObject({ code: "probe_failed" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
