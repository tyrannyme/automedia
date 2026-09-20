import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionStore } from "./store.ts";
import { exampleIds, listExamples, writeExample } from "./examples/index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("composition example catalog", () => {
  it("exposes the thirteen stable ids and descriptions", () => {
    expect(exampleIds).toEqual([
      "css-clock",
      "renderer-clock",
      "three-clock",
      "vgpu-shader",
      "motion-clock",
      "tailwind-page",
      "media-pair",
      "controls-knobs",
      "alpha-still",
      "silent-video",
      "strudel-music",
      "broken-script",
      "proof",
    ]);
    expect(listExamples().map(({ id }) => id)).toEqual(exampleIds);
  });

  it("writes a named example and rejects unknown ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "automedia-examples-unit-"));
    roots.push(root);
    const store = new CompositionStore(root);
    const composition = await writeExample(store, "css-clock");
    expect(composition).toMatchObject({
      name: "CSS clock",
      width: 640,
      height: 360,
      fps: 30,
      durationSeconds: 2,
      background: "#202020",
    });
    const media = await store.getMedia(composition.id);
    const block = media.tracks.find((track) => track.kind === "block");
    expect(block).toBeDefined();
    expect(
      (await store.readFile(composition.id, `blocks/${block?.asset}/index.html`)).content,
    ).toContain('id="box"');
    const music = await writeExample(store, "strudel-music");
    const musicDoc = await store.getMedia(music.id);
    const musicTrack = musicDoc.tracks.find((track) => track.kind === "music");
    expect(musicTrack?.mute).toBe(false);
    expect(
      (await store.readFile(music.id, `music/${musicTrack?.asset}/pattern.js`)).content,
    ).toContain("export default function pattern");
    // SAFETY: this deliberately exercises the runtime unknown-example guard.
    await expect(writeExample(store, "nope" as never)).rejects.toMatchObject({
      code: "unknown_example",
    });
  });
});
