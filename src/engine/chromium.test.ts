import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMissingBrowser,
  launchChromium,
  playwrightLaunchOptions,
  webGpuArgs,
} from "./chromium.ts";

beforeEach(() => {
  vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", "");
  vi.stubEnv("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", "1");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("playwrightLaunchOptions", () => {
  it("preserves the default browser and capture flags", () => {
    const options = playwrightLaunchOptions();
    expect(options.executablePath).toBeUndefined();
    expect(options.ignoreDefaultArgs).toBeUndefined();
    expect(options.chromiumSandbox).toBeUndefined();
    expect(options.args).toContain("--mute-audio");
    expect(options.args).toContain("--autoplay-policy=no-user-gesture-required");
    expect(options.args).toContain("--enable-unsafe-webgpu");
  });

  it("passes a configured executable to both ordinary and frame-farm launches", () => {
    // Only the path is validated here; this mock executable is never launched.
    vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", process.execPath);
    const options = playwrightLaunchOptions(["--enable-begin-frame-control"]);
    expect(options.executablePath).toBe(process.execPath);
    expect(options.args).toContain("--enable-begin-frame-control");
    expect(options.args).not.toContain("--no-sandbox");
    expect(options.chromiumSandbox).toBeUndefined();
  });

  it("rejects a relative override rather than looking it up on PATH", () => {
    vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", "chromium");
    expect(() => playwrightLaunchOptions()).toThrow("must be an absolute executable path");
  });

  it("rejects a missing file or directory with an actionable error", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "automedia-browser-test-"));
    try {
      for (const value of [root, path.join(root, "missing")]) {
        vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", value);
        expect(() => playwrightLaunchOptions()).toThrow("not an accessible executable file");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects a non-executable file", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "automedia-browser-test-"));
    try {
      const file = path.join(root, "browser with spaces");
      writeFileSync(file, "not executed");
      chmodSync(file, 0o600);
      vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", file);
      expect(() => playwrightLaunchOptions()).toThrow("not an accessible executable file");
      chmodSync(file, 0o700);
      expect(playwrightLaunchOptions().executablePath).toBe(file);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps WebGPU available in the capture browser", () => {
    expect(webGpuArgs()).toEqual(["--enable-unsafe-webgpu"]);
  });
});

describe("launchChromium", () => {
  it("launches the bundled browser when no override is set", async () => {
    // SAFETY: launchChromium hands the launched browser back without touching it.
    const browser = {} as Browser;
    const launch = vi.spyOn(chromium, "launch").mockResolvedValue(browser);
    expect(await launchChromium()).toBe(browser);
    expect(launch.mock.calls[0]?.[0]?.executablePath).toBeUndefined();
  });

  it("does not download or fall back after an explicit browser fails", async () => {
    vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", process.execPath);
    const cause = new Error("Executable doesn't exist: removed after validation");
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(cause);
    // The wrapped error is only thrown before the missing-browser download branch.
    await expect(launchChromium()).rejects.toMatchObject({
      message: expect.stringContaining("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH"),
      cause,
    });
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("keeps the no-download switch for the default browser", async () => {
    const cause = new Error("Executable doesn't exist");
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(cause);
    await expect(launchChromium()).rejects.toBe(cause);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid overrides before launching", async () => {
    vi.stubEnv("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH", "relative/browser");
    const launch = vi.spyOn(chromium, "launch");
    await expect(launchChromium()).rejects.toThrow("must be an absolute executable path");
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("isMissingBrowser", () => {
  it("recognizes Playwright's missing-executable error", () => {
    expect(
      isMissingBrowser("browserType.launch: Executable doesn't exist at /cache/headless_shell"),
    ).toBe(true);
    expect(isMissingBrowser("Target page, context or browser has been closed")).toBe(false);
  });
});
