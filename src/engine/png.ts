import { AppError } from "@shared/errors.ts";
import { CodecError } from "./codec-error.ts";
import { decodePngSync, type RgbaImage } from "./png-decode.ts";

export { decodePngOffThread } from "./codecs.ts";
export type { RgbaImage };

/** Decodes on the calling thread. Fine for one image, too slow per video frame. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  try {
    return decodePngSync(bytes);
  } catch (error) {
    if (error instanceof CodecError) throw new AppError(error.code, error.message);
    throw error;
  }
}
