import { ipcRenderer } from "electron";
import {
  videoEncoderChannel,
  type VideoEncoderReply,
  type VideoEncoderRequest,
} from "@shared/video-encoder.ts";

// Runs in the hidden encoder page. The main process sends RGBA frames and
// gets H.264 packets back from Chromium's own encoder.

let encoder: VideoEncoder | undefined;

function reply(message: VideoEncoderReply): void {
  ipcRenderer.send(videoEncoderChannel, message);
}

/** IPC only carries plain objects, and `colorSpace` may be a class instance. */
function plainDecoderConfig(config: VideoDecoderConfig): VideoDecoderConfig {
  const { codec, codedWidth, codedHeight, description, colorSpace } = config;
  return {
    codec,
    codedWidth,
    codedHeight,
    description,
    colorSpace: colorSpace && {
      primaries: colorSpace.primaries,
      transfer: colorSpace.transfer,
      matrix: colorSpace.matrix,
      fullRange: colorSpace.fullRange,
    },
  };
}

function open(config: VideoEncoderConfig): VideoEncoder {
  const next = new VideoEncoder({
    output(chunk, metadata) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      reply({
        type: "packet",
        data,
        key: chunk.type === "key",
        timestamp: chunk.timestamp,
        duration: chunk.duration ?? 0,
        decoderConfig: metadata?.decoderConfig && plainDecoderConfig(metadata.decoderConfig),
      });
    },
    error(error) {
      reply({ type: "error", message: error.message });
    },
  });
  next.configure(config);
  return next;
}

/** Keeps a few frames in flight so the encoder stays busy without piling up. */
async function drain(active: VideoEncoder): Promise<void> {
  while (active.encodeQueueSize > 2) {
    await new Promise((resolve) => active.addEventListener("dequeue", resolve, { once: true }));
  }
}

async function handle(request: VideoEncoderRequest): Promise<void> {
  if (request.type === "configure") {
    encoder = open(request.config);
    return;
  }
  if (!encoder) throw new Error("video encoder is not configured");
  if (request.type === "flush") {
    await encoder.flush();
    return;
  }
  const frame = new VideoFrame(request.data, {
    format: "RGBA",
    codedWidth: request.codedWidth,
    codedHeight: request.codedHeight,
    timestamp: request.timestamp,
    duration: request.duration,
  });
  try {
    encoder.encode(frame, { keyFrame: request.keyFrame });
  } finally {
    frame.close();
  }
  await drain(encoder);
}

ipcRenderer.on(videoEncoderChannel, async (_event, request: VideoEncoderRequest) => {
  try {
    await handle(request);
    reply({ type: "done" });
  } catch (error) {
    reply({ type: "error", message: String(error) });
  }
});
