import { describe, expect, it } from "vitest";
import { playwrightLaunchOptions, webGpuArgs } from "./chromium.ts";

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
