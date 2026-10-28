import { describe, expect, it } from "vitest";
import { limits } from "@shared/limits.ts";
import {
  fileExtension,
  formatBytes,
  formatMediaLength,
  imageTrackFromLibrary,
  libraryAssetKind,
  libraryAssets,
  isImageLibraryAsset,
  isVideoLibraryAsset,
} from "./library.ts";

describe("library helpers", () => {
  it("classifies video and image library assets", () => {
    expect(fileExtension("still.PNG")).toBe("png");
    expect(isImageLibraryAsset("poster.jpg")).toBe(true);
    expect(isImageLibraryAsset("logo.svg")).toBe(true);
    expect(isImageLibraryAsset("clip.mp4")).toBe(false);
    expect(isVideoLibraryAsset("clip.webm")).toBe(true);
    expect(isVideoLibraryAsset("poster.png")).toBe(false);
  });

  it("places a muted still on the first image lane at the playhead", () => {
    const track = imageTrackFromLibrary({
      id: "t-still",
      asset: "poster.png",
      playheadSeconds: 1.25,
      tracks: [
        {
          id: "t-block",
          kind: "block",
          asset: "b-intro",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
      ],
      selectedTrackId: "t-block",
    });
    expect(track).toMatchObject({
      id: "t-still",
      asset: "poster.png",
      kind: "image",
      start: 1.25,
      duration: limits.defaultBlockSeconds,
      mute: true,
      lane: 1,
    });
  });

  it("reuses an existing image lane when that lane is selected", () => {
    const existing = {
      id: "t-photo",
      kind: "image" as const,
      asset: "one.png",
      start: 0,
      duration: 3,
      trimStart: 0,
      rate: 1,
      volume: 1,
      mute: true,
      lane: 2,
    };
    const next = imageTrackFromLibrary({
      id: "t-two",
      asset: "two.webp",
      playheadSeconds: 0,
      tracks: [existing],
      selectedTrackId: existing.id,
    });
    expect(next.lane).toBe(2);
    expect(next.start).toBe(3);
  });

  it("honors an explicit destination lane", () => {
    const track = imageTrackFromLibrary({
      id: "t-drop",
      asset: "drop.png",
      playheadSeconds: 0,
      tracks: [],
      selectedTrackId: null,
      lane: 3,
    });
    expect(track.lane).toBe(3);
    expect(track.start).toBe(0);
  });

  it("lists project media from assets/ and names its kind", () => {
    expect(libraryAssets(["index.html", "assets/beat.ogg", "assets/guns.mp4"])).toEqual([
      "beat.ogg",
      "guns.mp4",
    ]);
    expect(libraryAssetKind("guns.mp4")).toBe("video");
    expect(libraryAssetKind("still.png")).toBe("image");
    expect(libraryAssetKind("beat.ogg")).toBe("audio");
  });

  it("formats sizes and lengths for receipts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(240_000)).toBe("240 KB");
    expect(formatBytes(3_300_000)).toBe("3.3 MB");
    expect(formatBytes(999_999)).toBe("1.0 MB");
    expect(formatMediaLength(4.93)).toBe("4.93 s");
    expect(formatMediaLength(12.34)).toBe("12.3 s");
    expect(formatMediaLength(62.5)).toBe("1:02.5");
  });
});
