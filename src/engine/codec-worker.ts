import { parentPort } from "node:worker_threads";
import { encodeAnimatedWebp, encodeGif, type AnimationFrame } from "./animation-encode.ts";
import { CodecError } from "./codec-error.ts";
import { decodePngSync, type RgbaImage } from "./png-decode.ts";

/**
 * CPU-heavy codec work, off the engine's event loop so one export never
 * stalls other agents' requests. Imports only modules that need no aliases.
 */

export type AnimationRequest = {
  format: "gif" | "webp";
  width: number;
  height: number;
  frames: readonly AnimationFrame[];
  quality: number | undefined;
};

export type CodecRequest =
  | { id: number; kind: "decodePng"; bytes: Uint8Array }
  | ({ id: number; kind: "encodeAnimation" } & AnimationRequest);

export type CodecReply =
  | { id: number; kind: "image"; image: RgbaImage }
  | { id: number; kind: "bytes"; bytes: Uint8Array }
  | { id: number; kind: "error"; code: string; message: string };

async function handle(request: CodecRequest): Promise<CodecReply> {
  if (request.kind === "decodePng") {
    return { id: request.id, kind: "image", image: decodePngSync(request.bytes) };
  }
  const bytes =
    request.format === "gif"
      ? await encodeGif(request.width, request.height, request.frames)
      : await encodeAnimatedWebp(request.width, request.height, request.frames, request.quality);
  return { id: request.id, kind: "bytes", bytes };
}

parentPort?.on("message", (request: CodecRequest) => {
  void handle(request)
    .catch((error): CodecReply => ({
      id: request.id,
      kind: "error",
      code: error instanceof CodecError ? error.code : "encode_failed",
      message: error instanceof Error ? error.message : "codec worker failed",
    }))
    .then((reply) => {
      const buffer =
        reply.kind === "image"
          ? reply.image.data.buffer
          : reply.kind === "bytes"
            ? reply.bytes.buffer
            : undefined;
      const transfer = buffer instanceof ArrayBuffer ? [buffer] : [];
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker port, not a window
      parentPort?.postMessage(reply, transfer);
    });
});
