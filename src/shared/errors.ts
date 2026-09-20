import { Result, TaggedError } from "better-result";
import type { IpcResult } from "./ipc.ts";

export type ErrorObject = {
  code: string;
  message: string;
};

export class AppError extends TaggedError("AppError")<{
  code: string;
  message: string;
}> {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

export class IpcClientError extends TaggedError("IpcClientError")<{
  code: string;
  message: string;
}> {
  constructor(code: string, message: string) {
    super({ code, message });
    this.name = code;
  }
}

export function ipcResultToResult<T>(result: IpcResult<T>): Result<T, IpcClientError> {
  if (result.ok) {
    return Result.ok(result.data);
  }
  return Result.err(new IpcClientError(result.error.code, result.error.message));
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  const parsed = ipcResultToResult(result);
  if (parsed.isOk()) {
    return parsed.value;
  }
  throw parsed.error;
}

export function missingBinaryError(binary: "ffmpeg" | "ffprobe"): AppError {
  const other = binary === "ffmpeg" ? "ffprobe" : "ffmpeg";
  return new AppError(
    binary === "ffprobe" ? "ffprobe_unavailable" : "ffmpeg_unavailable",
    `${binary} is not installed or not on PATH. Install ffmpeg (it includes ${other}) to import media and export video.`,
  );
}

export function mapMissingBinaryError(error: unknown): AppError | null {
  if (!(error instanceof Error)) return null;
  const code = "code" in error ? String(error.code) : "";
  if (code !== "ENOENT") return null;
  const text = `${error.message} ${error.name}`;
  if (/\bffprobe\b/i.test(text)) return missingBinaryError("ffprobe");
  if (/\bffmpeg\b/i.test(text)) return missingBinaryError("ffmpeg");
  return null;
}

export function toErrorObject(error: Error): ErrorObject {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  const missing = mapMissingBinaryError(error);
  if (missing) {
    return { code: missing.code, message: missing.message };
  }

  if (error.message.length > 0) {
    return { code: "internal", message: error.message };
  }

  return { code: "internal", message: "Unexpected error" };
}
