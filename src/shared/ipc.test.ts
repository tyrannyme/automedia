import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { ipcChannels } from "./ipc.ts";
import { startExportInputSchema, writeFileInputSchema } from "./schemas.ts";

describe("typed IPC contracts", () => {
  it("parses a writeFile payload", () => {
    expect(
      v.parse(writeFileInputSchema, {
        compositionId: "c123",
        path: "index.html",
        encoding: "utf8",
        content: "<html />",
        expectedEtag: "etag",
      }),
    ).toMatchObject({ path: "index.html", encoding: "utf8" });
  });

  it("accepts an odd-size export input for the runtime guard", () => {
    expect(
      v.parse(startExportInputSchema, {
        compositionId: "c123",
        format: "mp4",
      }),
    ).toEqual({ compositionId: "c123", format: "mp4" });
  });

  it("rejects quality for PNG and GIF at the IPC boundary", () => {
    for (const format of ["png", "gif", "wav"] as const) {
      expect(
        v.safeParse(startExportInputSchema, {
          compositionId: "c123",
          format,
          quality: 80,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects timeSeconds for non-PNG exports at the IPC boundary", () => {
    for (const format of ["gif", "webp", "mp4", "webm", "mp3", "wav", "ogg"] as const) {
      expect(
        v.safeParse(startExportInputSchema, {
          compositionId: "c123",
          format,
          timeSeconds: 1,
        }).success,
      ).toBe(false);
    }
  });

  it("keeps the exact channel groups", () => {
    expect(Object.keys(ipcChannels)).toEqual([
      "app",
      "compositions",
      "files",
      "media",
      "controls",
      "activity",
      "runtime",
      "validate",
      "export",
      "assets",
    ]);
  });
});
