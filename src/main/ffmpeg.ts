import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FfmpegHealth } from "@shared/ffmpeg.ts";
import { mapMissingBinaryError, missingBinaryError } from "@shared/errors.ts";

const execFileAsync = promisify(execFile);

export { mapMissingBinaryError, missingBinaryError } from "@shared/errors.ts";
export type { FfmpegHealth } from "@shared/ffmpeg.ts";

async function binaryAvailable(binary: "ffmpeg" | "ffprobe"): Promise<boolean> {
  try {
    await execFileAsync(binary, ["-version"], { timeout: 4000 });
    return true;
  } catch (error) {
    if (mapMissingBinaryError(error)) return false;
    return false;
  }
}

export async function ffmpegHealth(): Promise<FfmpegHealth> {
  const [ffmpeg, ffprobe] = await Promise.all([
    binaryAvailable("ffmpeg"),
    binaryAvailable("ffprobe"),
  ]);
  return { ffmpeg, ffprobe };
}

export function throwIfMissingBinary(
  error: unknown,
  binary: "ffmpeg" | "ffprobe" = "ffmpeg",
): never {
  throw mapMissingBinaryError(error) ?? missingBinaryError(binary);
}
