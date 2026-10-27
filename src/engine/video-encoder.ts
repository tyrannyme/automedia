import {
  AVCOL_PRI_BT709,
  AVCOL_RANGE_JPEG,
  AVCOL_RANGE_MPEG,
  AVCOL_SPC_BT709,
  AVCOL_TRC_BT709,
  AVERROR_EAGAIN,
  AVERROR_EOF,
  AV_PIX_FMT_YUV420P,
  AV_PIX_FMT_YUVJ420P,
  Codec,
  CodecContext,
  Dictionary,
  FF_DECODER_MJPEG,
  FF_ENCODER_H264_NVENC,
  FF_ENCODER_LIBVPX_VP9,
  FF_ENCODER_LIBX264,
  FFmpegError,
  FilterAPI,
  Frame,
  Packet,
  Rational,
  type FFEncoderCodec,
} from "node-av";
import { AppError } from "@shared/errors.ts";

export type EncodedFrame = {
  data: Uint8Array;
  key: boolean;
  /** Presentation frame number. */
  frame: number;
};

export type FrameEncoder = {
  /** The codec string for the container, known once the first packet is out. */
  codec(): string;
  /** Takes the next frame, and frees it, and returns whatever packets are ready. */
  encode(frame: Frame): Promise<EncodedFrame[]>;
  flush(): Promise<EncodedFrame[]>;
  close(): void;
};

type EncoderChoice = { name: FFEncoderCodec; options: Record<string, string> };

/**
 * H.264 for MP4: NVENC on a machine that has it, x264 otherwise. VP9 for
 * WebM. The rate follows the export's quality the way the software path did.
 */
export function encoderChoices(format: "mp4" | "webm", quality: number): EncoderChoice[] {
  if (format === "webm") {
    // Constant quality, like the previous `-b:v 0 -crf`: 40 at quality 1, 15 at 100.
    const crf = String(Math.round(40 - (quality - 1) * (25 / 99)));
    return [
      {
        name: FF_ENCODER_LIBVPX_VP9,
        options: { crf, "b:v": "0", deadline: "realtime", "cpu-used": "5", "row-mt": "1" },
      },
    ];
  }
  const bitrate = String(250_000 + quality * 50_000);
  const rate = {
    "b:v": bitrate,
    maxrate: String(Number(bitrate) * 2),
    bufsize: String(Number(bitrate) * 2),
  };
  return [
    {
      name: FF_ENCODER_H264_NVENC,
      options: { ...rate, preset: "p5", rc: "vbr", profile: "high", bf: "2" },
    },
    {
      name: FF_ENCODER_LIBX264,
      options: { ...rate, preset: "veryfast", profile: "high", bf: "2" },
    },
  ];
}

let missingEncoders = new Set<FFEncoderCodec>();

/** For tests: forget which encoders failed to open. */
export function resetEncoderChoices(): void {
  missingEncoders = new Set();
}

async function openEncoder(
  format: "mp4" | "webm",
  quality: number,
  width: number,
  height: number,
  fps: number,
): Promise<{ context: CodecContext }> {
  for (const choice of encoderChoices(format, quality)) {
    if (missingEncoders.has(choice.name)) continue;
    const codec = Codec.findEncoderByName(choice.name);
    if (!codec) continue;
    const context = new CodecContext();
    context.allocContext3(codec);
    context.width = width;
    context.height = height;
    context.pixelFormat = AV_PIX_FMT_YUV420P;
    context.timeBase = new Rational(1, fps);
    context.framerate = new Rational(fps, 1);
    context.gopSize = fps * 2;
    context.colorRange = AVCOL_RANGE_MPEG;
    context.colorPrimaries = AVCOL_PRI_BT709;
    context.colorTrc = AVCOL_TRC_BT709;
    context.colorSpace = AVCOL_SPC_BT709;
    // A machine without the hardware fails here, cleanly; take the next one.
    const opened = await context.open2(codec, Dictionary.fromObject(choice.options));
    if (opened >= 0) return { context };
    context.freeContext();
    missingEncoders.add(choice.name);
  }
  throw new AppError("encode_failed", `no ${format === "mp4" ? "H.264" : "VP9"} encoder opened`);
}

const hex = (value: number | undefined) => (value ?? 0).toString(16).padStart(2, "0");

/** The `avc1.PPCCLL` string from the SPS in an Annex B keyframe. */
function avcCodecString(data: Uint8Array): string | undefined {
  for (let index = 0; index + 7 < data.length; index += 1) {
    const startCode = data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 1;
    if (startCode && ((data[index + 3] ?? 0) & 0x1f) === 7) {
      return `avc1.${hex(data[index + 4])}${hex(data[index + 5])}${hex(data[index + 6])}`;
    }
  }
  return undefined;
}

/** Turns captured JPEGs into the frames the encoder takes. */
export type FrameConverter = {
  convert(jpeg: Uint8Array): Promise<Frame>;
  close(): void;
};

/**
 * Decodes captured JPEGs, which are BT.601 full range, into BT.709 limited
 * range, as players expect of HD video. Each capture worker has its own, so
 * frames decode in parallel ahead of the one encoder.
 */
export async function openFrameConverter(): Promise<FrameConverter> {
  const decoderCodec = Codec.findDecoderByName(FF_DECODER_MJPEG);
  if (!decoderCodec) throw new AppError("encode_failed", "no JPEG decoder");
  const decoder = new CodecContext();
  decoder.allocContext3(decoderCodec);
  decoder.threadCount = 1;
  FFmpegError.throwIfError(await decoder.open2(decoderCodec, null), "open the JPEG decoder");
  // Only the matrix and range change: Chromium's pixels already have BT.709
  // primaries and transfer, and its JPEGs encode them with BT.601 weights.
  // Converting in YUV is many times cheaper than through RGB, and a farm runs
  // one converter per browser, so each keeps to one thread.
  const toVideo = FilterAPI.create(
    "colorspace=ispace=bt470bg:irange=pc:iprimaries=bt709:itrc=bt709:space=bt709:range=tv:primaries=bt709:trc=bt709:format=yuv420p",
    { graph: { nbThreads: 1 } },
  );
  const packet = new Packet();
  packet.alloc();
  const decoded = new Frame();
  decoded.alloc();
  // The filter graph only needs some time base; the encoder sets the real one.
  const timeBase = new Rational(1, 1);
  return {
    async convert(jpeg) {
      packet.data = Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
      FFmpegError.throwIfError(await decoder.sendPacket(packet), "read a JPEG frame");
      packet.unref();
      FFmpegError.throwIfError(await decoder.receiveFrame(decoded), "decode a JPEG frame");
      // Same planes as yuvj420p, said the current way.
      if (decoded.format === AV_PIX_FMT_YUVJ420P) decoded.format = AV_PIX_FMT_YUV420P;
      decoded.colorRange = AVCOL_RANGE_JPEG;
      decoded.timeBase = timeBase;
      decoded.pts = 0n;
      const [converted] = await toVideo.processAll(decoded);
      decoded.unref();
      if (!converted) throw new AppError("encode_failed", "a frame did not convert");
      return converted;
    },
    close() {
      packet.free();
      decoded.free();
      toVideo.close();
      decoder.freeContext();
    },
  };
}

/** Encodes converted frames, in order, into H.264 or VP9 packets. */
export async function openFrameEncoder(
  format: "mp4" | "webm",
  quality: number,
  width: number,
  height: number,
  fps: number,
): Promise<FrameEncoder> {
  const { context: encoder } = await openEncoder(format, quality, width, height, fps);
  const output = new Packet();
  output.alloc();
  // H.264 names its profile and level in the SPS of the first keyframe.
  let codec = format === "webm" ? "vp09.00.41.08" : "";
  let next = 0;

  const drain = async (): Promise<EncodedFrame[]> => {
    const packets: EncodedFrame[] = [];
    for (;;) {
      const received = await encoder.receivePacket(output);
      if (received === AVERROR_EAGAIN || received === AVERROR_EOF) return packets;
      FFmpegError.throwIfError(received, "encode a frame");
      const data = new Uint8Array(output.data ?? new Uint8Array());
      if (codec === "") codec = avcCodecString(data) ?? "avc1.640028";
      packets.push({ data, key: output.isKeyframe, frame: Number(output.pts) });
      output.unref();
    }
  };

  return {
    codec: () => codec,
    async encode(frame) {
      frame.pts = BigInt(next);
      next += 1;
      try {
        FFmpegError.throwIfError(await encoder.sendFrame(frame), "encode a frame");
      } finally {
        frame.free();
      }
      return drain();
    },
    async flush() {
      FFmpegError.throwIfError(await encoder.sendFrame(null), "finish encoding");
      return drain();
    },
    close() {
      output.free();
      encoder.freeContext();
    },
  };
}
