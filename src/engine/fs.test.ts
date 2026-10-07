import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "@shared/errors.ts";
import { pathExists, removeFile, resolveInside } from "./fs.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveInside", () => {
  it("rejects traversal outside an assets directory", () => {
    expect(() =>
      resolveInside(path.join("/tmp", "composition", "assets"), "../../secret.mp4"),
    ).toThrowError(AppError);
    expect(() =>
      resolveInside(path.join("/tmp", "composition", "assets"), "../../secret.mp4"),
    ).toThrowError(/path escapes the composition/);
  });
});

describe("removeFile", () => {
  it("removes an existing file and ignores a missing one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-fs-"));
    dirs.push(dir);
    const filePath = path.join(dir, "clip.mp4");
    await writeFile(filePath, "x");
    await removeFile(filePath);
    await expect(pathExists(filePath)).resolves.toBe(false);
    await expect(removeFile(filePath)).resolves.toBeUndefined();
  });
});
