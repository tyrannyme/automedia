import { spawn } from "node:child_process";
import { mapMissingBinaryError } from "@shared/errors.ts";

export async function decodeRgba(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-v", "error", "-i", filePath, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => {
      reject(mapMissingBinaryError(error) ?? error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(errors.join("") || `ffmpeg exited ${code}`));
      }
    });
  });
}

export function pixel(
  rgba: Buffer,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0, rgba[offset + 3] ?? 0];
}
