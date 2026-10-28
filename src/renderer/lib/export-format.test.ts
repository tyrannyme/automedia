import { nextExportFileName } from "@shared/export-name.ts";
import { describe, expect, it } from "vitest";
import { audioEncoding } from "../../engine/export-audio.ts";
import { maxAnimatedWebpBytes } from "../../engine/animation-encode.ts";
import {
  audibleTrackNames,
  exportAge,
  exportSoundLine,
  audioBlock,
  defaultExportFormat,
  exactExportBytes,
  exportAudioKbps,
  exportBlocks,
  exportChecks,
  exportFormatBlock,
  exportFormatDisabled,
  exportFormatGroups,
  exportFormatLabel,
  exportFormatLine,
  exportGroupNote,
  exportQualityLabel,
  exportSpecLine,
  formatBytes,
  maxAnimatedWebpFrameBytes,
  nearestEvenSize,
  videoBlock,
  videoExportBlock,
  webpBlock,
} from "./export-format.ts";

const fourChords = {
  name: "Four chords",
  width: 1280,
  height: 720,
  fps: 30,
  durationSeconds: 8,
  background: "#0a0a0a",
};
const chords = [
  { kind: "block", mute: false, name: "Four chords", asset: "blocks/b1/index.html" },
  { kind: "music", mute: false, name: "Chords", asset: "music/m1" },
];

describe("export formats", () => {
  it("names formats in Poppins-facing copy", () => {
    expect(exportFormatLabel("mp4")).toBe("MP4");
    expect(exportFormatLabel("webm")).toBe("WebM");
    expect(exportFormatLabel("webp")).toBe("WebP");
    expect(exportFormatLabel("ogg")).toBe("OGG");
  });

  it("groups the eight formats as Video, Still and Audio", () => {
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
  });

  it("blocks MP4 and WebM only", () => {
    expect(exportFormatDisabled("mp4", { videoBlocked: true })).toBe(true);
    expect(exportFormatDisabled("png", { videoBlocked: true })).toBe(false);
    expect(exportFormatDisabled("mp4", { videoBlocked: false })).toBe(false);
  });
});

describe("blocked formats", () => {
  it("offers a background for a transparent piece", () => {
    const block = videoBlock({ ...fourChords, name: "Sticker", background: "transparent" });
    expect(block?.title).toBe("Video needs an opaque background.");
    expect(block?.detail).toContain("Sticker is transparent");
    expect(block?.fix).toEqual({ kind: "background" });
    expect(videoExportBlock({ ...fourChords, background: "transparent" })).toContain("opaque");
  });

  it("offers the nearest even size for an odd one", () => {
    expect(nearestEvenSize(721, 1280)).toEqual({ width: 720, height: 1280 });
    expect(nearestEvenSize(1, 3)).toEqual({ width: 2, height: 2 });
    expect(videoBlock({ ...fourChords, width: 721, height: 1280 })?.fix).toEqual({
      kind: "size",
      width: 720,
      height: 1280,
    });
    expect(videoBlock(fourChords)).toBeNull();
    expect(videoBlock(null)).toBeNull();
  });

  it("blocks audio without an unmuted sound track", () => {
    expect(audioBlock(chords)).toBeNull();
    expect(audioBlock([chords[0]!])?.title).toBe("No sound to export.");
    expect(audioBlock([{ ...chords[1]!, mute: true }])).not.toBeNull();
  });

  it("blocks animated WebP past the engine's frame budget", () => {
    expect(maxAnimatedWebpFrameBytes).toBe(maxAnimatedWebpBytes);
    expect(webpBlock(fourChords)).toBeNull();
    expect(
      webpBlock({ ...fourChords, width: 3840, height: 2160, durationSeconds: 60 }),
    ).not.toBeNull();
  });

  it("maps each format to its block", () => {
    const blocks = exportBlocks({ ...fourChords, background: "transparent" }, [chords[0]!]);
    expect(exportFormatBlock("mp4", blocks)).toBe(blocks.video);
    expect(exportFormatBlock("wav", blocks)).toBe(blocks.audio);
    expect(exportFormatBlock("png", blocks)).toBeNull();
  });

  it("opens on a format that works", () => {
    const open = exportBlocks(fourChords, chords);
    expect(defaultExportFormat("webm", open)).toBe("webm");
    const sticker = exportBlocks({ ...fourChords, background: "transparent" }, []);
    expect(defaultExportFormat("mp4", sticker)).toBe("webp");
    expect(defaultExportFormat("gif", sticker)).toBe("gif");
    expect(defaultExportFormat("wav", exportBlocks(fourChords, []))).toBe("mp4");
  });
});

describe("format copy", () => {
  const context = { composition: fourChords, hasSound: true, quality: 80, playheadSeconds: 2.65 };

  it("says what each option makes", () => {
    expect(exportFormatLine("mp4", context)).toBe("H.264 + AAC · plays anywhere");
    expect(exportFormatLine("mp4", { ...context, hasSound: false })).toBe("H.264 · plays anywhere");
    expect(exportFormatLine("png", context)).toBe("frame 80 · the playhead");
    expect(exportFormatLine("gif", context)).toBe("240 frames · 256 colours");
    expect(exportFormatLine("webp", context)).toBe("240 frames · lossless");
    expect(exportFormatLine("wav", context)).toBe("48 kHz · lossless");
    expect(exportFormatLine("mp3", context)).toBe("268 kbps · 8.0 s");
  });

  it("writes the spec line of the file you will get", () => {
    expect(exportSpecLine("mp4", context)).toBe(
      "H.264 + AAC · 1280 × 720 · 30 fps · 8.0 s · quality 80",
    );
    expect(exportSpecLine("webp", context)).toContain("effort 80");
    expect(exportSpecLine("wav", context)).toBe("PCM 16-bit · 48 kHz stereo · 8.0 s");
  });

  it("labels WebP's slider as effort", () => {
    expect(exportQualityLabel("webp")).toBe("Effort (smaller file, slower)");
    expect(exportQualityLabel("mp4")).toBe("Quality");
    expect(exportQualityLabel("png")).toBeNull();
    expect(exportQualityLabel("wav")).toBeNull();
  });

  it("notes each group", () => {
    const audible = audibleTrackNames(chords);
    expect(audible).toEqual(["Chords"]);
    expect(exportGroupNote("video", { transparent: false, audible })).toBe("picture and sound");
    expect(exportGroupNote("still", { transparent: true, audible })).toBe("keeps transparency");
    expect(exportGroupNote("audio", { transparent: false, audible })).toBe("the Chords track");
  });

  it("matches the engine's audio bitrates", () => {
    for (const format of ["mp4", "webm", "mp3", "ogg"] as const) {
      for (const quality of [1, 50, 80, 100]) {
        const bitrate = audioEncoding(format, quality).rate?.bitrate;
        expect(exportAudioKbps(format, quality)).toBe(Math.round(Number(bitrate) / 1000));
      }
    }
    expect(exportAudioKbps("wav")).toBeNull();
  });

  it("knows the exact size of a WAV and no other", () => {
    expect(exactExportBytes("wav", { durationSeconds: 8 })).toBe(1_536_044);
    expect(exactExportBytes("mp4", { durationSeconds: 8 })).toBeNull();
    expect(formatBytes(1_536_044)).toBe("1.5 MB");
    expect(formatBytes(240_000)).toBe("240 KB");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("says what the engine checked", () => {
    expect(exportChecks("mp4", true)).toBe("codec, size, rate, length, sound");
    expect(exportChecks("wav", true)).toBe("codec, length");
    expect(exportChecks("png", false)).toBeNull();
  });
});

describe("receipt copy", () => {
  it("ages files", () => {
    expect(exportAge(0, 30_000)).toBe("now");
    expect(exportAge(0, 6 * 60_000)).toBe("6m ago");
    expect(exportAge(0, 90 * 60_000)).toBe("1h ago");
  });

  it("names the file before it exists, after the project", () => {
    expect(nextExportFileName("Four chords", "mp4", [])).toBe("four-chords.mp4");
    expect(nextExportFileName("Four chords", "mp4", ["four-chords.mp4"])).toBe("four-chords-2.mp4");
    expect(nextExportFileName("Four chords", "png", [], 79)).toBe("four-chords-f79.png");
  });

  it("describes the sound", () => {
    expect(exportSoundLine("mp4")).toBe("AAC · 192 kbps · 48 kHz");
    expect(exportSoundLine("png")).toBeNull();
  });
});
