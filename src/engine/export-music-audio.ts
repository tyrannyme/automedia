import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import type { Page } from "playwright";

/**
 * Renders one music clip offline in its own document, the way Strudel's
 * `renderPatternAudio` does, but a cycle at a time: every note of a cycle is
 * scheduled on an OfflineAudioContext suspended where that cycle starts, so
 * the graph only ever holds the notes that are sounding. A minute of music
 * renders in seconds instead of playing for a minute.
 *
 * The pattern gets the clip's volume as its gain, like the live runtime, and
 * plays from cycle 0 at the clip's start. The page returns 16-bit WAV bytes.
 */
export function musicRenderSource(durationSeconds: number, gain: number, sampleRate: number) {
  return `(async () => {
  const imports = JSON.parse(document.querySelector("script[type=importmap]").textContent).imports;
  const strudel = await import(new URL(imports["@strudel/web"], location.href).href);
  const authored = (await import(new URL("pattern.js", location.href).href)).default;
  const pattern = typeof authored === "function" ? authored(${gain}) : authored;
  const cps = strudel.getCps?.() ?? 0.5;
  const seconds = ${durationSeconds};
  const rate = ${sampleRate};
  const cycles = seconds * cps;
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * rate)), rate);
  strudel.setAudioContext(context);
  // Superdough builds its output for the current context on first use.
  strudel.setSuperdoughAudioController(null);
  await strudel.initAudio({ maxPolyphony: strudel.DEFAULT_MAX_POLYPHONY, multiChannelOrbits: false });
  let rendering = null;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const haps = pattern
      .queryArc(cycle, Math.min(cycle + 1, cycles), { _cps: cps })
      .filter((hap) => hap.hasOnset())
      .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
    for (const hap of haps) {
      hap.ensureObjectValue();
      const at = hap.whole.begin.valueOf() / cps;
      await strudel.superdough(hap.value, at, hap.duration / cps, cps, at);
    }
    // Rendering stops where this cycle starts, so the next cycle's notes are
    // scheduled before any of them plays.
    const paused = cycle + 1 < cycles ? context.suspend(cycle / cps) : null;
    if (rendering === null) rendering = context.startRendering();
    else await context.resume();
    if (paused) await paused;
  }
  const buffer = await rendering;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const bytes = new Uint8Array(44 + left.length * 4);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + left.length * 4, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, left.length * 4, true);
  for (let index = 0; index < left.length; index += 1) {
    view.setInt16(44 + index * 4, Math.round(Math.max(-1, Math.min(1, left[index])) * 32767), true);
    view.setInt16(46 + index * 4, Math.round(Math.max(-1, Math.min(1, right[index])) * 32767), true);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
})()`;
}

/** Renders the music document open in `page` to WAV bytes. */
export async function renderMusicAudio(
  page: Page,
  durationSeconds: number,
  volume: number,
  sampleRate: number,
): Promise<Uint8Array> {
  const gain = Math.max(0, Math.min(1, volume));
  const wav = v.parse(
    v.string(),
    await page.evaluate(musicRenderSource(durationSeconds, gain, sampleRate)),
  );
  if (wav.length === 0) throw new AppError("capture_failed", "music audio did not render");
  return Buffer.from(wav, "base64");
}

export function encodeWav(channelData: Array<ArrayLike<number>>, sampleRate: number): Buffer {
  const channels = Math.max(1, channelData.length);
  const length = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]?.[index] ?? 0));
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += 2;
    }
  }
  return buffer;
}
