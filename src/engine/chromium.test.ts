import { describe, expect, it } from "vitest";
import { isMissingBrowser, playwrightLaunchOptions, webGpuArgs } from "./chromium.ts";

describe("playwrightLaunchOptions", () => {
  it("mutes export-browser output while allowing autoplay for capture", () => {
    const options = playwrightLaunchOptions();
    expect(options.ignoreDefaultArgs).toBeUndefined();
    expect(options.args).toContain("--mute-audio");
    expect(options.args).toContain("--autoplay-policy=no-user-gesture-required");
    expect(options.args).toContain("--enable-unsafe-webgpu");
  });

  it("keeps WebGPU available in the capture browser", () => {
    expect(webGpuArgs()).toEqual(["--enable-unsafe-webgpu"]);
  });
});

describe("isMissingBrowser", () => {
  it("recognizes Playwright's missing-executable error", () => {
    expect(
      isMissingBrowser(
        "browserType.launch: Executable doesn't exist at /home/me/.cache/ms-playwright/chromium_headless_shell-1243/chrome-linux/headless_shell",
      ),
    ).toBe(true);
    expect(isMissingBrowser("Target page, context or browser has been closed")).toBe(false);
  });
});
