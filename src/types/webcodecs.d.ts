// @types/dom-webcodecs predates the WebCodecs `format` copy option, which
// Mediabunny's VideoSample.copyTo supports for RGBA readback.
interface VideoFrameCopyToOptions {
  format?: VideoPixelFormat;
}
