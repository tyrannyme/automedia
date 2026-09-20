import { describe, expect, it } from "vitest";
import {
  catalogsMatch,
  ensureProjectArchiveExtension,
  isDeniedProjectPath,
  projectArchiveFileName,
  projectTrackSourcePath,
  shouldCompressArchivePath,
  skipArchiveDirectory,
} from "./project-archive.ts";

describe("project archive paths", () => {
  it("names a snapshot from the composition title", () => {
    expect(projectArchiveFileName("CSS clock")).toBe("CSS clock.automedia");
    expect(projectArchiveFileName('bad<>:"/\\|?*name')).toBe("badname.automedia");
    expect(projectArchiveFileName("   ")).toBe("Untitled.automedia");
    expect(ensureProjectArchiveExtension("/tmp/clock")).toBe("/tmp/clock.automedia");
    expect(ensureProjectArchiveExtension("/tmp/clock.automedia")).toBe("/tmp/clock.automedia");
  });

  it("packs authored files and the thumbnail, not exports or activity", () => {
    expect(isDeniedProjectPath("composition.json")).toBe(false);
    expect(isDeniedProjectPath("notes.md")).toBe(false);
    expect(isDeniedProjectPath(".automedia/thumbnail.png")).toBe(false);
    expect(isDeniedProjectPath("automedia.json")).toBe(false);
    expect(isDeniedProjectPath("exports/job.mp4")).toBe(true);
    expect(isDeniedProjectPath(".agent-activity.jsonl")).toBe(true);
    expect(isDeniedProjectPath("music/s1/index.html")).toBe(true);
    expect(isDeniedProjectPath("music/s1/style.css")).toBe(true);
    expect(isDeniedProjectPath("music/s1/script.js")).toBe(true);
    expect(isDeniedProjectPath("music/s1/pattern.js")).toBe(false);
    expect(isDeniedProjectPath(".git/config")).toBe(true);
    expect(skipArchiveDirectory("exports")).toBe(true);
    expect(skipArchiveDirectory(".automedia")).toBe(false);
    expect(skipArchiveDirectory(".git")).toBe(true);
  });

  it("stores compressed media uncompressed and maps clip sources", () => {
    expect(shouldCompressArchivePath("composition.json")).toBe(true);
    expect(shouldCompressArchivePath("assets/clip.mp4")).toBe(false);
    expect(shouldCompressArchivePath(".automedia/thumbnail.png")).toBe(false);
    expect(projectTrackSourcePath({ kind: "block", asset: "b1" })).toBe("blocks/b1/index.html");
    expect(projectTrackSourcePath({ kind: "music", asset: "s1" })).toBe("music/s1/pattern.js");
    expect(projectTrackSourcePath({ kind: "video", asset: "clip.mp4" })).toBe("assets/clip.mp4");
  });

  it("compares runtime catalogs field by field", () => {
    const catalog = {
      three: "0.185.1",
      tailwindBrowser: "4.3.3",
      motion: "13.1.0",
      strudel: "1.2.8",
    };
    expect(catalogsMatch(catalog, catalog)).toBe(true);
    expect(catalogsMatch(catalog, { ...catalog, strudel: "9.9.9" })).toBe(false);
  });
});
