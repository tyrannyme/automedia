import { describe, expect, it } from "vitest";
import {
  audibleAssetTracks,
  audibleMusicTracks,
  exportExpectsAudio,
  exportNeedsFfmpeg,
  exportNeedsQuality,
  isAssetExtension,
  isAssetKind,
  isAudibleKind,
  isAudioExportFormat,
  isBlockKind,
  isCompositorLayerKind,
  isDocumentKind,
  isExportFormat,
  isImageExtension,
  isImageKind,
  isMusicKind,
  isMediaExtension,
  isVideoExportFormat,
  isVideoKind,
  mediaPrepareCount,
} from "./media.ts";

describe("media helpers", () => {
  it("recognizes owned media extensions and export formats", () => {
    expect(isMediaExtension("ogg")).toBe(true);
    expect(isMediaExtension("mp4")).toBe(true);
    expect(isMediaExtension("html")).toBe(false);
    expect(isImageExtension("png")).toBe(true);
    expect(isImageExtension("jpg")).toBe(true);
    expect(isImageExtension("svg")).toBe(true);
    expect(isImageExtension("mp4")).toBe(false);
    expect(isAssetExtension("png")).toBe(true);
    expect(isAssetExtension("webm")).toBe(true);
    expect(isAssetExtension("html")).toBe(false);
    expect(isExportFormat("png")).toBe(true);
    expect(isExportFormat("mp3")).toBe(true);
    expect(isExportFormat("wav")).toBe(true);
    expect(isExportFormat("ogg")).toBe(true);
    expect(isExportFormat("jpg")).toBe(false);
    expect(isVideoExportFormat("mp4")).toBe(true);
    expect(isAudioExportFormat("wav")).toBe(true);
    expect(exportNeedsQuality("mp3")).toBe(true);
    expect(exportNeedsQuality("wav")).toBe(false);
    expect(exportNeedsFfmpeg("png")).toBe(false);
    expect(exportNeedsFfmpeg("ogg")).toBe(true);
  });

  it("counts only audio and video tracks for media preparation", () => {
    expect(
      mediaPrepareCount([
        { kind: "block" },
        { kind: "block" },
        { kind: "video" },
        { kind: "audio" },
      ]),
    ).toBe(2);
    expect(mediaPrepareCount([{ kind: "block" }, { kind: "block" }])).toBe(0);
    expect(mediaPrepareCount([{ kind: "music" }, { kind: "audio" }])).toBe(1);
    expect(mediaPrepareCount([{ kind: "image" }, { kind: "video" }])).toBe(1);
  });

  it("treats block and music as document clips, audio and video as assets", () => {
    expect(isDocumentKind("block")).toBe(true);
    expect(isDocumentKind("music")).toBe(true);
    expect(isDocumentKind("audio")).toBe(false);
    expect(isBlockKind("block")).toBe(true);
    expect(isBlockKind("music")).toBe(false);
    expect(isMusicKind("music")).toBe(true);
    expect(isMusicKind("block")).toBe(false);
    expect(isImageKind("image")).toBe(true);
    expect(isImageKind("video")).toBe(false);
    expect(isVideoKind("video")).toBe(true);
    expect(isVideoKind("image")).toBe(false);
    expect(isAssetKind("audio")).toBe(true);
    expect(isAssetKind("music")).toBe(false);
    expect(isAssetKind("image")).toBe(false);
    expect(isAudibleKind("music")).toBe(true);
    expect(isAudibleKind("image")).toBe(false);
    expect(isCompositorLayerKind("image")).toBe(true);
    expect(isCompositorLayerKind("block")).toBe(true);
    expect(isCompositorLayerKind("video")).toBe(true);
    expect(isCompositorLayerKind("audio")).toBe(false);
    expect(
      audibleAssetTracks([
        { kind: "audio", mute: false },
        { kind: "audio", mute: true },
        { kind: "music", mute: false },
        { kind: "video", mute: false },
        { kind: "block", mute: true },
      ]),
    ).toEqual([
      { kind: "audio", mute: false },
      { kind: "video", mute: false },
    ]);
    expect(
      audibleMusicTracks([
        { kind: "music", mute: false },
        { kind: "music", mute: true },
        { kind: "audio", mute: false },
        { kind: "block", mute: false },
      ]),
    ).toEqual([{ kind: "music", mute: false }]);
  });

  it("expects export audio for unmuted assets or music, not mute-only document tracks", () => {
    expect(exportExpectsAudio([{ kind: "music", mute: false }])).toBe(true);
    expect(exportExpectsAudio([{ kind: "audio", mute: false }])).toBe(true);
    expect(exportExpectsAudio([{ kind: "music", mute: true }])).toBe(false);
    expect(exportExpectsAudio([{ kind: "block", mute: false }])).toBe(false);
    expect(exportExpectsAudio([{ kind: "image", mute: false }])).toBe(false);
    expect(
      exportExpectsAudio([
        { kind: "music", mute: false },
        { kind: "audio", mute: true },
      ]),
    ).toBe(true);
  });
});
