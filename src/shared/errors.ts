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

export function throwIfCanceled(isCanceled: () => boolean): void {
  if (isCanceled()) {
    throw new AppError("canceled", "export canceled");
  }
}

export function toErrorObject(error: Error): ErrorObject {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  if (error.message.length > 0) {
    return { code: "internal", message: error.message };
  }

  return { code: "internal", message: "Unexpected error" };
}
