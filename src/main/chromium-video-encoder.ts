import path from "node:path";
import { app, protocol, WebContentsView } from "electron";
// Imported directly: ./mediabunny.ts registers this encoder, so going through
// it would be circular.
import { CustomVideoEncoder, EncodedPacket, type VideoCodec, type VideoSample } from "mediabunny";
import {
  videoEncoderChannel,
  videoEncoderScheme,
  type VideoEncoderReply,
  type VideoEncoderRequest,
} from "@shared/video-encoder.ts";

/**
 * WebCodecs only exists in secure contexts, which about:blank and data: URLs
 * are not, so the encoder page is served from its own privileged scheme.
 * Must run before the app is ready.
 */
export function registerVideoEncoderScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: videoEncoderScheme, privileges: { standard: true, secure: true } },
  ]);
  void app.whenReady().then(() => {
    protocol.handle(
      videoEncoderScheme,
      () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    );
  });
}

/**
 * Encodes H.264 with Chromium's WebCodecs encoder in a hidden page.
 *
 * node-av's x264 is built with transparent huge page support on Linux x64: it
 * requests 2 MB-aligned memory for any buffer over 1.75 MB, which is every
 * frame from about 720p up. Inside Electron, `memalign` is Chromium's
 * PartitionAlloc, which aborts the whole process on alignments over 1 MB.
 * Chromium's own encoder allocates safely, so every platform uses it.
 */
export class ChromiumAvcEncoder extends CustomVideoEncoder {
  static override supports(codec: VideoCodec): boolean {
    return codec === "avc";
  }

  private view: WebContentsView | undefined;
  private pending: { resolve: () => void; reject: (error: Error) => void } | undefined;

  async init(): Promise<void> {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "video-encoder.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.view = view;
    view.webContents.ipc.on(videoEncoderChannel, (_event, reply: VideoEncoderReply) => {
      this.receive(reply);
    });
    view.webContents.on("render-process-gone", (_event, details) => {
      this.receive({ type: "error", message: `encoder page exited (${details.reason})` });
    });
    await view.webContents.loadURL(`${videoEncoderScheme}://encoder/`);
    await this.request({ type: "configure", config: this.config });
  }

  async encode(sample: VideoSample, options: VideoEncoderEncodeOptions): Promise<void> {
    const data = new Uint8Array(sample.allocationSize({ format: "RGBA" }));
    await sample.copyTo(data, { format: "RGBA" });
    await this.request({
      type: "frame",
      data,
      codedWidth: sample.codedWidth,
      codedHeight: sample.codedHeight,
      timestamp: sample.microsecondTimestamp,
      duration: sample.microsecondDuration,
      keyFrame: options.keyFrame ?? false,
    });
  }

  flush(): Promise<void> {
    return this.request({ type: "flush" });
  }

  close(): void {
    this.pending?.reject(new Error("H.264 encoder closed"));
    this.pending = undefined;
    this.view?.webContents.close();
    this.view = undefined;
  }

  /** The page answers one request at a time; Mediabunny serializes calls. */
  private request(message: VideoEncoderRequest): Promise<void> {
    const view = this.view;
    if (!view || view.webContents.isDestroyed()) {
      return Promise.reject(new Error("H.264 encoder closed"));
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      view.webContents.send(videoEncoderChannel, message);
    });
  }

  private receive(reply: VideoEncoderReply): void {
    if (reply.type === "packet") {
      const packet = new EncodedPacket(
        reply.data,
        reply.key ? "key" : "delta",
        reply.timestamp / 1e6,
        reply.duration / 1e6,
      );
      this.onPacket(packet, reply.decoderConfig && { decoderConfig: reply.decoderConfig });
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    if (reply.type === "done") {
      pending?.resolve();
      return;
    }
    const error = new Error(`H.264 encoder failed: ${reply.message}`);
    if (pending) pending.reject(error);
    else this.onError(error);
  }
}
