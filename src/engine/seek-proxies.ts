import { createHash, randomBytes } from "node:crypto";
import { readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_VP8,
  AV_CODEC_ID_VP9,
  AV_HWDEVICE_TYPE_CUDA,
  AV_PIX_FMT_YUV420P,
  AV_PIX_FMT_YUVJ420P,
  Decoder,
  Demuxer,
  Encoder,
  FF_ENCODER_H264_NVENC,
  FF_ENCODER_LIBX264,
  HardwareContext,
  Muxer,
} from "node-av";
import { ensureDir, isFile } from "./fs.ts";

/**
 * Seek proxies make every frame of a video quick to reach. An export seeks
 * each `<video>` to every frame it shows, and Chromium decodes each seek from
 * the keyframe before it: a clip recorded with one keyframe decodes from its
 * start on every frame. A proxy has a keyframe every `proxyGop` frames, so a
 * seek decodes at most that many.
 *
 * Only exports read proxies; the preview plays the original. They live in the
 * library's cache, outside every project, keyed by the source's path, size,
 * and modification time.
 */
const proxyGop = 10;
const proxyConcurrency = 3;
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const proxiedCodecs = new Set<number>([
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_VP8,
  AV_CODEC_ID_VP9,
]);
const building = new Map<string, Promise<void>>();

export function seekProxyDir(libraryRoot: string): string {
  return path.join(libraryRoot, "cache", "seek-proxies");
}

async function proxyPath(libraryRoot: string, source: string): Promise<string> {
  const info = await stat(source);
  const key = createHash("sha256")
    .update(`${path.resolve(source)}\0${info.size}\0${info.mtimeMs}`)
    .digest("hex")
    .slice(0, 32);
  return path.join(seekProxyDir(libraryRoot), `${key}.mp4`);
}

/** The proxy to serve in place of `source`, if one has been built. */
export async function readySeekProxy(
  libraryRoot: string,
  source: string,
): Promise<string | undefined> {
  if (!videoExtensions.has(path.extname(source).toLowerCase())) return undefined;
  const proxy = await proxyPath(libraryRoot, source).catch(() => undefined);
  return proxy && (await isFile(proxy)) ? proxy : undefined;
}

/** Builds the proxies a composition's videos need, a few at a time. */
export async function prepareSeekProxies(libraryRoot: string, assetsDir: string): Promise<void> {
  const names = await readdir(assetsDir).catch(() => []);
  const videos = names
    .filter((name) => videoExtensions.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(assetsDir, name));
  // The biggest first, so the longest build is never left to start last.
  const sizes = new Map(
    await Promise.all(videos.map(async (video) => [video, (await stat(video)).size] as const)),
  );
  const sources = videos.toSorted(
    (left, right) => (sizes.get(right) ?? 0) - (sizes.get(left) ?? 0),
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(proxyConcurrency, sources.length) }, async () => {
      for (let index = next++; index < sources.length; index = next++) {
        await prepareSeekProxy(libraryRoot, sources[index] ?? "");
      }
    }),
  );
}

async function prepareSeekProxy(libraryRoot: string, source: string): Promise<void> {
  const proxy = await proxyPath(libraryRoot, source);
  if (await isFile(proxy)) return;
  let pending = building.get(proxy);
  if (!pending) {
    pending = buildSeekProxy(source, proxy).finally(() => building.delete(proxy));
    building.set(proxy, pending);
  }
  await pending;
}

async function buildSeekProxy(source: string, proxy: string): Promise<void> {
  await using input = await Demuxer.open(source);
  const stream = input.video();
  if (!stream || !(await needsProxy(source, stream.index))) return;
  const { codecId, format } = stream.codecpar;
  // A proxy is 8-bit 4:2:0 H.264 without alpha; anything else stays as it is.
  if (!proxiedCodecs.has(codecId)) return;
  if (format !== AV_PIX_FMT_YUV420P && format !== AV_PIX_FMT_YUVJ420P) return;
  if (stream.metadata?.get("alpha_mode") === "1") return;
  await ensureDir(path.dirname(proxy));
  // NVDEC decodes straight into frames NVENC reads, so the whole proxy stays
  // on the GPU. A clip the GPU cannot take is built again on the CPU.
  if (!nvencMissing) {
    using gpu = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
    if (gpu) {
      try {
        await writeProxy(source, proxy, gpu);
        return;
      } catch {
        // Fall through to the CPU.
      }
    }
  }
  await writeProxy(source, proxy, null);
}

async function writeProxy(
  source: string,
  proxy: string,
  hardware: HardwareContext | null,
): Promise<void> {
  const temp = `${proxy}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await using input = await Demuxer.open(source);
    const stream = input.video();
    if (!stream) return;
    using decoder = await Decoder.create(
      stream,
      hardware ? { hardware } : { context: { threadCount: 0 } },
    );
    using encoder = await proxyEncoder(decoder);
    {
      // Timestamps keep the source's values on a 1000 times finer clock.
      // Chromium seeks to the keyframe at or before the requested time,
      // rounded to the file's clock; on the source's own clock a request a
      // hair before a keyframe rounds onto it, and the frame before it is
      // never decoded. The finer clock keeps them apart.
      const timeBase = stream.timeBase;
      await using output = await Muxer.open(temp, {
        format: "mp4",
        options: {
          movflags: "+faststart",
          video_track_timescale: timeBase.num === 1 ? timeBase.den * 1000 : 1_000_000,
        },
      });
      const index = output.addStream(encoder, { inputStream: stream });
      for await (const packet of encoder.packets(decoder.frames(input.packets(stream.index)))) {
        await output.writePacket(packet, index);
      }
    }
    await rename(temp, proxy);
  } finally {
    await rm(temp, { force: true });
  }
}

/** True when some frame sits more than `proxyGop` frames after its keyframe. */
async function needsProxy(source: string, streamIndex: number): Promise<boolean> {
  await using input = await Demuxer.open(source);
  let sinceKey = 0;
  for await (const packet of input.packets(streamIndex)) {
    if (!packet) break;
    sinceKey = packet.isKeyframe ? 0 : sinceKey + 1;
    if (sinceKey >= proxyGop) return true;
  }
  return false;
}

let nvencMissing = false;

/** NVENC when this machine has it, and x264 otherwise. */
async function proxyEncoder(decoder: Decoder): Promise<Encoder> {
  const common = { decoder, gopSize: proxyGop, maxBFrames: 0 };
  if (!nvencMissing) {
    try {
      return await Encoder.create(FF_ENCODER_H264_NVENC, {
        ...common,
        options: { preset: "p1", rc: "constqp", qp: 18 },
      });
    } catch {
      nvencMissing = true;
    }
  }
  return Encoder.create(FF_ENCODER_LIBX264, {
    ...common,
    options: { preset: "ultrafast", crf: 16 },
  });
}
