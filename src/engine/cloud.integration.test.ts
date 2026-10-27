import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { startEngine, type RunningEngine } from "./engine.ts";
import {
  ALL_FORMATS,
  AudioSampleSink,
  FilePathSource,
  Input,
  VideoSampleSink,
} from "./mediabunny.ts";
import { decodePng } from "./png.ts";

// Opt-in, never silently skipped by the dedicated cloud job when enabled.
it.skipIf(process.env.AUTOMEDIA_CLOUD_SMOKE !== "1")(
  "exports real PNG, WAV and MP4 with a pre-provisioned cloud browser",
  async () => {
    expect(process.env.AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH).toBeTruthy();
    expect(process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).toBe("1");
    const root = await mkdtemp(path.join(os.tmpdir(), "automedia-cloud-"));
    let engine: RunningEngine | undefined;
    try {
      engine = await startEngine(root, { port: 0 });
      const { store, queue } = engine;
      const composition = await store.create();
      await store.updateSettings({
        compositionId: composition.id,
        width: 64,
        height: 64,
        fps: 6,
        durationSeconds: 1,
        background: "#000000",
      });
      const block = await store.createBlock(composition.id);
      const style = `blocks/${block.asset}/style.css`;
      await store.writeFile(
        composition.id,
        style,
        "utf8",
        "html, body { margin: 0; width: 100%; height: 100%; }\n",
        (await store.readFile(composition.id, style)).etag,
      );
      const script = `blocks/${block.asset}/script.js`;
      await store.writeFile(
        composition.id,
        script,
        "utf8",
        `
window.automedia.registerRenderer(({ frame }) => {
  const level = 40 + frame * 30;
  document.body.style.background = "rgb(" + level + ", " + level + ", " + level + ")";
});
`,
        (await store.readFile(composition.id, script)).etag,
      );
      await store.putTrack(composition.id, { ...block, start: 0, duration: 1 });
      const music = await store.createMusicBlock(composition.id);
      const pattern = `music/${music.asset}/pattern.js`;
      await store.writeFile(
        composition.id,
        pattern,
        "utf8",
        `
import { note } from "@strudel/web";
export default function pattern(gain) {
  return note("a4").s("sine").gain(0.15 * gain);
}
`,
        (await store.readFile(composition.id, pattern)).etag,
      );
      await store.putTrack(composition.id, { ...music, start: 0, duration: 1 });

      async function exportFile(format: "png" | "wav" | "mp4") {
        const job = await queue.start({ compositionId: composition.id, format });
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const current = queue.get(job.id);
          if (current.phase === "failed" || current.phase === "canceled") {
            throw new Error(`${format} export ${current.phase}: ${JSON.stringify(current.error)}`);
          }
          if (current.phase === "completed") {
            expect(current.outputPath).toBeTruthy();
            return current.outputPath ?? "";
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await queue.cancel(job.id);
        throw new Error(`${format} export timed out`);
      }

      const png = decodePng(await readFile(await exportFile("png")));
      expect([png.width, png.height]).toEqual([64, 64]);
      expect(png.data[(32 * 64 + 32) * 4]).toBe(40);
      using wav = new Input({
        source: new FilePathSource(await exportFile("wav")),
        formats: ALL_FORMATS,
      });
      const audio = await wav.getPrimaryAudioTrack();
      expect(audio).not.toBeNull();
      if (!audio) throw new Error("WAV has no audio track");
      let peak = 0;
      for await (const sample of new AudioSampleSink(audio).samples()) {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: 0, format: "f32-planar" });
        for (const value of plane) peak = Math.max(peak, Math.abs(value));
        sample.close();
      }
      expect(peak).toBeGreaterThan(0.01);

      using mp4 = new Input({
        source: new FilePathSource(await exportFile("mp4")),
        formats: ALL_FORMATS,
      });
      const video = await mp4.getPrimaryVideoTrack();
      expect(await mp4.getPrimaryAudioTrack()).not.toBeNull();
      if (!video) throw new Error("MP4 has no video track");
      const levels: number[] = [];
      for await (const sample of new VideoSampleSink(video).samples()) {
        expect([sample.codedWidth, sample.codedHeight]).toEqual([64, 64]);
        const bytes = new Uint8Array(sample.allocationSize({ format: "RGBA" }));
        await sample.copyTo(bytes, { format: "RGBA" });
        levels.push(bytes[(32 * 64 + 32) * 4] ?? 0);
        sample.close();
      }
      expect(levels).toHaveLength(6);
      for (const [frame, value] of levels.entries()) {
        expect(Math.abs(value - (40 + frame * 30))).toBeLessThanOrEqual(5);
      }
    } finally {
      await engine?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  300_000,
);
