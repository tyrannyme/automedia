import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { makeConsoleBestEffort } from "./best-effort-console.ts";

describe("makeConsoleBestEffort", () => {
  it("survives the write errors a closed launcher causes", () => {
    const stream = new PassThrough();
    makeConsoleBestEffort([stream]);
    for (const code of ["EPIPE", "EIO"]) {
      const error = Object.assign(new Error(`write ${code}`), { code });
      expect(() => stream.emit("error", error)).not.toThrow();
    }
  });
});
