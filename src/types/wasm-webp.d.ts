// wasm-webp's package entry points do not resolve under Node ESM, so the
// exporter loads the Emscripten factory directly. These are the bindings it
// uses from that module.
declare module "wasm-webp/dist/esm/webp-wasm.js" {
  export type WebpFrameConfig = { lossless: number; quality: number };

  export type WebpAnimationFrame = {
    data: Uint8Array;
    duration: number;
    config: WebpFrameConfig;
    has_config: boolean;
  };

  export type WebpDecodedFrame = {
    width: number;
    height: number;
    duration: number;
    data: Uint8Array;
  };

  export type WebpFrameVector = {
    push_back(frame: WebpAnimationFrame): void;
    delete(): void;
  };

  export type WebpModule = {
    VectorWebPAnimationFrame: new () => WebpFrameVector;
    encodeAnimation(
      width: number,
      height: number,
      hasAlpha: boolean,
      frames: WebpFrameVector,
    ): Uint8Array | null;
    /** Returns views into wasm memory; copy before the next call. */
    decodeAnimation(data: Uint8Array, hasAlpha: boolean): WebpDecodedFrame[] | null;
  };

  const createWebpModule: () => Promise<WebpModule>;
  export default createWebpModule;
}
