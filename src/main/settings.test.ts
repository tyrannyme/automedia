import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSettings, writeSettings } from "./settings.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("settings", () => {
  it("reads the default when settings.json is missing", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "automedia-settings-"));
    dirs.push(userData);
    await expect(readSettings(userData)).resolves.toEqual({ lastCompositionId: null });
  });

  it("round trips settings through settings.json", async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), "automedia-settings-"));
    dirs.push(userData);
    await writeSettings(userData, { lastCompositionId: "c1" });
    await expect(readSettings(userData)).resolves.toEqual({ lastCompositionId: "c1" });
  });
});
