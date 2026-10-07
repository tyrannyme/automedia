import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { AppError } from "@shared/errors.ts";
import type { AnimationRequest, CodecReply, CodecRequest } from "./codec-worker.ts";
import type { RgbaImage } from "./png-decode.ts";
import { defaultHeavySlots } from "./render-pool.ts";

type Pending = {
  worker: number;
  resolve: (reply: CodecReply) => void;
  reject: (error: Error) => void;
};

/** Requests without an id; the pool numbers them. */
type CodecJob =
  | { kind: "decodePng"; bytes: Uint8Array }
  | ({ kind: "encodeAnimation" } & AnimationRequest);

/**
 * The engine serves every agent from one event loop. A 1080p frame takes
 * about 50 ms to decode and a long GIF seconds to encode, so both run on
 * worker threads, one per export slot.
 */
class CodecWorkers {
  private readonly workers: Array<Worker | undefined> = [];
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;

  constructor(private readonly size: number) {}

  run(job: CodecJob, transfer: ArrayBuffer[]): Promise<CodecReply> {
    const id = ++this.nextId;
    const index = id % this.size;
    const worker = this.worker(index);
    const request: CodecRequest = { ...job, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { worker: index, resolve, reject });
      worker.postMessage(request, [...new Set(transfer)]);
    });
  }

  private worker(index: number): Worker {
    const existing = this.workers[index];
    if (existing) return existing;
    const worker = existsSync(bundledWorker)
      ? new Worker(bundledWorker)
      : // Tests load the TypeScript source, which Node parses as a module
        // only after warning that package.json does not say so.
        new Worker(sourceWorker, { execArgv: ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"] });
    // Idle workers must not keep the engine or a test run alive.
    worker.unref();
    worker.on("message", (reply: CodecReply) => {
      const pending = this.pending.get(reply.id);
      this.pending.delete(reply.id);
      pending?.resolve(reply);
    });
    worker.on("error", (cause) => {
      const error = cause instanceof Error ? cause : new Error("codec worker failed");
      this.workers[index] = undefined;
      for (const [id, pending] of this.pending) {
        if (pending.worker !== index) continue;
        this.pending.delete(id);
        pending.reject(error);
      }
    });
    this.workers[index] = worker;
    return worker;
  }
}

/** The bundle ships codec-worker.js beside it; tests load the TypeScript source. */
const bundledWorker = path.join(__dirname, "codec-worker.js");
const sourceWorker = path.join(__dirname, "codec-worker.ts");

let workers: CodecWorkers | undefined;

function codecWorkers(): CodecWorkers {
  workers ??= new CodecWorkers(Math.max(2, defaultHeavySlots()));
  return workers;
}

function failure(reply: CodecReply): AppError {
  if (reply.kind === "error") return new AppError(reply.code, reply.message);
  return new AppError("internal", `codec worker sent ${reply.kind} unexpectedly`);
}

export async function decodePngOffThread(bytes: Uint8Array): Promise<RgbaImage> {
  // Copied so the transfer never detaches a buffer the caller still holds.
  const copy = new Uint8Array(bytes);
  const reply = await codecWorkers().run({ kind: "decodePng", bytes: copy }, [copy.buffer]);
  if (reply.kind !== "image") throw failure(reply);
  return reply.image;
}

/** Takes ownership of the frames: their pixel buffers move to the worker. */
export async function encodeAnimationOffThread(request: AnimationRequest): Promise<Uint8Array> {
  const transfer = request.frames.map((frame) => frame.rgba.buffer);
  const reply = await codecWorkers().run({ kind: "encodeAnimation", ...request }, transfer);
  if (reply.kind !== "bytes") throw failure(reply);
  return reply.bytes;
}
