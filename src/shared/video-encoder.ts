/**
 * Messages between the main process and the hidden page that encodes H.264
 * with Chromium's WebCodecs. Every request gets exactly one `done` or `error`
 * reply; `packet` replies stream in between as the encoder produces output.
 */
export const videoEncoderChannel = "video-encoder";

export const videoEncoderScheme = "automedia-encoder";

export type VideoEncoderRequest =
  | { type: "configure"; config: VideoEncoderConfig }
  | {
      type: "frame";
      data: Uint8Array;
      codedWidth: number;
      codedHeight: number;
      timestamp: number;
      duration: number;
      keyFrame: boolean;
    }
  | { type: "flush" };

export type VideoEncoderReply =
  | { type: "done" }
  | { type: "error"; message: string }
  | {
      type: "packet";
      data: Uint8Array;
      key: boolean;
      timestamp: number;
      duration: number;
      decoderConfig: VideoDecoderConfig | undefined;
    };
