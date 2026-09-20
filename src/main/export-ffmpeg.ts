import { spawn } from "node:child_process";
import { AppError, mapMissingBinaryError } from "@shared/errors.ts";

export function throwIfCanceled(isCanceled: () => boolean): void {
  if (isCanceled()) {
    throw new AppError("canceled", "export canceled");
  }
}

export async function waitForDrain(
  stdin: import("node:stream").Writable,
  isCanceled: () => boolean,
  processFailure?: Promise<never>,
): Promise<void> {
  let timer: ReturnType<typeof setInterval>;
  let onDrain: () => void;
  const drainPromise = new Promise<void>((resolve, reject) => {
    timer = setInterval(() => {
      if (!isCanceled()) {
        return;
      }
      clearInterval(timer);
      stdin.off("drain", onDrain);
      reject(new AppError("canceled", "export canceled"));
    }, 25);
    onDrain = () => {
      resolve();
    };
    stdin.once("drain", onDrain);
  });
  const result = processFailure ? Promise.race([drainPromise, processFailure]) : drainPromise;
  await result.finally(() => {
    clearInterval(timer);
    stdin.off("drain", onDrain);
  });
}

export function waitForProcessExit(
  child: ReturnType<typeof spawn>,
  stderr: Buffer[],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      reject(mapMissingBinaryError(error) ?? error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new AppError("encode_failed", stderr.join("").slice(-4000) || `ffmpeg exited ${code}`),
      );
    });
  });
}

export async function isWebpDecodable(
  filePath: string,
  isCanceled: () => boolean,
): Promise<boolean> {
  throwIfCanceled(isCanceled);
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      "ffmpeg",
      ["-v", "error", "-i", filePath, "-frames:v", "1", "-f", "null", "-"],
      {
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    let settled = false;
    const timer = setInterval(() => {
      if (!isCanceled() || settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolve(false);
    }, 25);
    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      resolve(result);
    };
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
  });
}

export async function runFfmpeg(
  args: string[],
  isCanceled: () => boolean = () => false,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const timer = setInterval(() => {
      if (!isCanceled()) {
        return;
      }
      clearInterval(timer);
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      reject(new AppError("canceled", "export canceled"));
    }, 25);
    child.on("error", (error) => {
      clearInterval(timer);
      reject(mapMissingBinaryError(error) ?? error);
    });
    child.on("close", (code) => {
      clearInterval(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new AppError("encode_failed", stderr.join("").slice(-4000) || `ffmpeg exited ${code}`),
      );
    });
  });
}
