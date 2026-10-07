import { describe, expect, it } from "vitest";
import { defaultMusicPattern, musicRuntimeFile, musicRuntimeJs } from "./music-template.ts";

describe("music runtime", () => {
  it("authors only the Strudel pattern", () => {
    expect(defaultMusicPattern).toContain('from "@strudel/web"');
    expect(defaultMusicPattern).toContain("export default function pattern(gain)");
    expect(defaultMusicPattern).toContain("voicings");
    expect(defaultMusicPattern).toContain("stack");
    expect(defaultMusicPattern).toContain("getting-started");
    expect(defaultMusicPattern).not.toContain("initStrudel");
    expect(defaultMusicPattern).not.toContain("registerRenderer");
    expect(defaultMusicPattern).not.toContain("<!doctype html>");
    expect(defaultMusicPattern).not.toContain("samples(");
    expect(defaultMusicPattern).not.toContain("dirt-samples");
    expect(defaultMusicPattern).not.toContain(".bank(");
  });

  it("keeps transport and gain in a non-visual managed runtime", () => {
    expect(musicRuntimeJs).toContain('from "./pattern.js"');
    expect(musicRuntimeJs).toContain("initAudio");
    expect(musicRuntimeJs).toContain("initStrudel");
    expect(musicRuntimeJs).toContain("generation !== requestGeneration");
    expect(musicRuntimeJs).toContain("if (startPromise) return startPromise");
    expect(musicRuntimeJs).toContain("playRequested = false");
    expect(musicRuntimeJs).not.toContain("if (!playing) return");
    expect(musicRuntimeJs).toContain('location.pathname.includes("/music/" + track.asset + "/")');
    expect(musicRuntimeJs).not.toContain("registerRenderer");
    expect(musicRuntimeJs).not.toContain("canvas");
    const html = musicRuntimeFile("html", "Theme <score>").content;
    expect(html).toContain("<title>Theme &lt;score&gt;</title>");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("Music</p>");
    const css = musicRuntimeFile("css", "Theme");
    expect(css.contentType).toBe("text/css; charset=utf-8");
    expect(css.content).toContain("background: transparent");
    expect(css.content).not.toContain("#111111");
    expect(musicRuntimeFile("js", "Theme").content).toBe(musicRuntimeJs);
  });
});
