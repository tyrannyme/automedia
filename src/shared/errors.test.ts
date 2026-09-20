import { describe, expect, it } from "vitest";
import { Result } from "better-result";
import {
  AppError,
  IpcClientError,
  ipcResultToResult,
  toErrorObject,
  unwrapIpcResult,
} from "./errors.ts";

describe("toErrorObject", () => {
  it("rewrites spawn ffmpeg ENOENT into a health error", () => {
    const error = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    expect(toErrorObject(error)).toEqual({
      code: "ffmpeg_unavailable",
      message:
        "ffmpeg is not installed or not on PATH. Install ffmpeg (it includes ffprobe) to import media and export video.",
    });
  });

  it("keeps the code and message from AppError", () => {
    const error = new AppError("revision_conflict", "etag does not match");

    expect(toErrorObject(error)).toEqual({
      code: "revision_conflict",
      message: "etag does not match",
    });
  });

  it("keeps AppError as a Better Result tagged Error", () => {
    const error = new AppError("invalid_path", "bad path");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error).toHaveProperty("_tag", "AppError");
    expect(error.code).toBe("invalid_path");
    expect(error.message).toBe("bad path");
  });
});

describe("IpcClientError", () => {
  it("retains the protocol error code", () => {
    const error = new IpcClientError("not_found", "missing composition");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("not_found");
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("missing composition");
    expect(error).toHaveProperty("_tag", "IpcClientError");
  });

  it("converts both wire branches to Better Results", () => {
    const success = ipcResultToResult({ ok: true, data: 42 });
    const failure = ipcResultToResult({
      ok: false,
      error: { code: "not_found", message: "x" },
    });

    expect(Result.isOk(success) && success.value).toBe(42);
    expect(Result.isError(failure) && failure.error).toBeInstanceOf(IpcClientError);
  });

  it("unwraps a failed IPC result into IpcClientError", () => {
    expect(() =>
      unwrapIpcResult({ ok: false, error: { code: "not_found", message: "x" } }),
    ).toThrow(IpcClientError);
    try {
      unwrapIpcResult({ ok: false, error: { code: "not_found", message: "x" } });
    } catch (error) {
      expect(error).toMatchObject({ name: "not_found", code: "not_found", message: "x" });
    }
  });
});
