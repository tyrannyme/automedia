import { describe, expect, it } from "vitest";
import {
  blockDirectory,
  blockPaths,
  codeFileFromPath,
  firstBlockDirectory,
} from "./block-paths.ts";

describe("block paths", () => {
  it("builds the three source files for a block directory", () => {
    expect(blockDirectory("b1")).toBe("blocks/b1");
    expect(blockPaths("blocks/b1")).toEqual({
      html: "blocks/b1/index.html",
      css: "blocks/b1/style.css",
      js: "blocks/b1/script.js",
    });
  });

  it("maps a written path back to a code file", () => {
    expect(codeFileFromPath("blocks/b1/index.html")).toBe("html");
    expect(codeFileFromPath("blocks/b1/style.css")).toBe("css");
    expect(codeFileFromPath("blocks/b1/script.js")).toBe("js");
    expect(codeFileFromPath("music/s1/script.js")).toBeNull();
    expect(codeFileFromPath("assets/clip.mp4")).toBeNull();
  });

  it("prefers the selected block, then the first block", () => {
    const tracks = [
      { id: "t1", kind: "video", asset: "clip.mp4" },
      { id: "t2", kind: "block", asset: "b1" },
      { id: "t3", kind: "block", asset: "b2" },
      { id: "t4", kind: "music", asset: "b3" },
    ];
    expect(firstBlockDirectory(tracks, "t3")).toBe("blocks/b2");
    expect(firstBlockDirectory(tracks, "t4")).toBe("blocks/b1");
    expect(firstBlockDirectory(tracks, null)).toBe("blocks/b1");
    expect(firstBlockDirectory(tracks, "t1")).toBe("blocks/b1");
    expect(firstBlockDirectory([{ id: "t4", kind: "music", asset: "b3" }], null)).toBeNull();
    expect(firstBlockDirectory([], null)).toBeNull();
  });
});
