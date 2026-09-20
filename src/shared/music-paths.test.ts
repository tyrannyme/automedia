import { describe, expect, it } from "vitest";
import {
  documentFrameSrc,
  firstMusicAsset,
  isManagedMusicRuntimePath,
  isMusicPatternPath,
  musicAssetFromPath,
  musicDirectory,
  musicPatternPath,
  musicRuntimeKind,
} from "./music-paths.ts";

describe("music paths", () => {
  it("builds the authored pattern path", () => {
    expect(musicDirectory("s1")).toBe("music/s1");
    expect(musicPatternPath("s1")).toBe("music/s1/pattern.js");
    expect(isMusicPatternPath("music/s1/pattern.js")).toBe(true);
    expect(isMusicPatternPath("music/s1/script.js")).toBe(false);
    expect(isMusicPatternPath("blocks/b1/script.js")).toBe(false);
  });

  it("treats HTML, CSS, and JS under music/ as managed runtime", () => {
    expect(isManagedMusicRuntimePath("music/s1/index.html")).toBe(true);
    expect(isManagedMusicRuntimePath("music/s1/style.css")).toBe(true);
    expect(isManagedMusicRuntimePath("music/s1/script.js")).toBe(true);
    expect(isManagedMusicRuntimePath("music/s1/pattern.js")).toBe(false);
    expect(musicRuntimeKind("music/s1/index.html")).toBe("html");
    expect(musicRuntimeKind("music/s1/style.css")).toBe("css");
    expect(musicRuntimeKind("music/s1/script.js")).toBe("js");
    expect(musicRuntimeKind("music/s1/pattern.js")).toBeNull();
    expect(musicAssetFromPath("music/s1/script.js")).toBe("s1");
  });

  it("points music iframes at the managed entry", () => {
    expect(documentFrameSrc({ kind: "block", asset: "b1" })).toBe("blocks/b1/index.html");
    expect(documentFrameSrc({ kind: "music", asset: "s1" })).toBe("music/s1/index.html");
  });

  it("prefers the selected music clip, then the first music clip", () => {
    const tracks = [
      { id: "t1", kind: "block", asset: "b1" },
      { id: "t2", kind: "music", asset: "s1" },
      { id: "t3", kind: "music", asset: "s2" },
    ];
    expect(firstMusicAsset(tracks, "t3")).toBe("s2");
    expect(firstMusicAsset(tracks, "t1")).toBe("s1");
    expect(firstMusicAsset(tracks, null)).toBe("s1");
    expect(firstMusicAsset([{ id: "t1", kind: "block", asset: "b1" }], null)).toBeNull();
  });
});
