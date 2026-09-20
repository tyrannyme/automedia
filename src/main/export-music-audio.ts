import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import type { Page } from "playwright";
import { throwIfCanceled } from "./export-ffmpeg.ts";
import { seekInjectedRuntime, waitForPaint } from "./page-runtime.ts";

const audiblePeak = 1e-4;

export const musicAudioTapSource = `(() => {
  if (globalThis.__automediaMusicTap) return;
  const taps = new WeakMap();
  const contexts = new Set();
  const chunks = [];
  let recording = false;
  let sampleRate = 48000;
  let peak = 0;

  function ensureTap(ctx) {
    let tap = taps.get(ctx);
    if (tap) return tap;
    if (ctx.constructor && ctx.constructor.name === "OfflineAudioContext") return null;
    const processor = ctx.createScriptProcessor(4096, 2, 2);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    tap = { processor, silent };
    taps.set(ctx, tap);
    contexts.add(ctx);
    processor.connect(silent);
    silent.connect(ctx.destination);
    processor.onaudioprocess = (event) => {
      if (!recording) return;
      sampleRate = ctx.sampleRate;
      const frames = event.inputBuffer.length;
      const sourceLeft = event.inputBuffer.getChannelData(0);
      const sourceRight =
        event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : sourceLeft;
      const left = new Int16Array(frames);
      const right = new Int16Array(frames);
      for (let index = 0; index < frames; index += 1) {
        const a = Math.max(-1, Math.min(1, sourceLeft[index]));
        const b = Math.max(-1, Math.min(1, sourceRight[index]));
        peak = Math.max(peak, Math.abs(a), Math.abs(b));
        left[index] = Math.round(a * 32767);
        right[index] = Math.round(b * 32767);
      }
      chunks.push([left, right]);
    };
    return tap;
  }

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest) {
    const result = origConnect.apply(this, arguments);
    try {
      const tap = this.context ? ensureTap(this.context) : null;
      if (
        tap &&
        dest === this.context.destination &&
        this !== tap.processor &&
        this !== tap.silent
      ) {
        origConnect.call(this, tap.processor);
      }
    } catch {
      /* keep playback working if the tap cannot attach */
    }
    return result;
  };

  function encodeWav(left, right) {
    const length = left.length;
    const dataSize = length * 4;
    const bytes = new Uint8Array(44 + dataSize);
    const view = new DataView(bytes.buffer);
    function writeString(offset, text) {
      for (let index = 0; index < text.length; index += 1) {
        bytes[offset + index] = text.charCodeAt(index);
      }
    }
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let index = 0; index < length; index += 1) {
      view.setInt16(offset, left[index], true);
      view.setInt16(offset + 2, right[index], true);
      offset += 4;
    }
    let binary = "";
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step));
    }
    return btoa(binary);
  }

  globalThis.__automediaMusicTap = {
    arm() {
      chunks.length = 0;
      peak = 0;
      recording = true;
      for (const ctx of contexts) {
        void ctx.resume();
      }
    },
    stop() {
      recording = false;
      const length = chunks.reduce((sum, pair) => sum + pair[0].length, 0);
      const left = new Int16Array(length);
      const right = new Int16Array(length);
      let offset = 0;
      for (const [channelLeft, channelRight] of chunks) {
        left.set(channelLeft, offset);
        right.set(channelRight, offset);
        offset += channelLeft.length;
      }
      chunks.length = 0;
      return {
        sampleRate,
        peak,
        samples: length,
        wavBase64: length > 0 ? encodeWav(left, right) : "",
      };
    },
  };
})();`;

const capturedAudioSchema = v.object({
  sampleRate: v.number(),
  peak: v.number(),
  samples: v.number(),
  wavBase64: v.string(),
});

export type CapturedAudio = v.InferOutput<typeof capturedAudioSchema>;

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

export function pcmIsAudible(pcm: CapturedAudio | null | undefined): pcm is CapturedAudio {
  return Boolean(pcm && pcm.peak >= audiblePeak && pcm.samples > 0 && pcm.wavBase64.length > 0);
}

async function evaluateInFrames(page: Page, script: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const frame of page.frames()) {
    try {
      results.push(await frame.evaluate(script));
    } catch {
      /* detached or not yet instrumented */
    }
  }
  return results;
}

export async function recordMusicAudio(
  page: Page,
  durationSeconds: number,
  isCanceled: () => boolean = () => false,
): Promise<Buffer[]> {
  throwIfCanceled(isCanceled);
  await seekInjectedRuntime(page, 0, 0);
  await waitForPaint(page);
  throwIfCanceled(isCanceled);
  await evaluateInFrames(page, musicAudioTapSource);
  await evaluateInFrames(
    page,
    "globalThis.__automediaMusicTap && globalThis.__automediaMusicTap.arm()",
  );
  await page.evaluate(`window.postMessage({ source: "automedia", type: "play" }, "*")`);
  const deadline = Date.now() + durationSeconds * 1000 + 250;
  while (Date.now() < deadline) {
    throwIfCanceled(isCanceled);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await page.evaluate(`window.postMessage({ source: "automedia", type: "pause" }, "*")`);
  const recordings = (
    await evaluateInFrames(
      page,
      "globalThis.__automediaMusicTap ? globalThis.__automediaMusicTap.stop() : null",
    )
  ).flatMap((value) => (v.is(capturedAudioSchema, value) ? [value] : []));
  const wavs = recordings.filter(pcmIsAudible).map((pcm) => Buffer.from(pcm.wavBase64, "base64"));
  if (wavs.length === 0) {
    const summary = recordings
      .map((pcm) => `peak=${pcm.peak.toFixed(6)} samples=${pcm.samples}`)
      .join("; ");
    throw new AppError(
      "capture_failed",
      summary ? `music audio did not render (${summary})` : "music audio did not render",
    );
  }
  return wavs;
}
