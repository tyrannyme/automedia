import { chromium, type Browser, type LaunchOptions } from "playwright";

export function webGpuArgs(): string[] {
  return ["--enable-unsafe-webgpu"];
}

/**
 * Headless launches use Playwright's chromium-headless-shell, which has no
 * browser UI to start and about half the memory of full Chromium. It keeps
 * WebGL2 and WebGPU through SwiftShader.
 */
export function playwrightLaunchOptions(): LaunchOptions {
  return {
    handleSIGINT: false,
    handleSIGTERM: false,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", ...webGpuArgs()],
  };
}

export async function launchChromium(): Promise<Browser> {
  return chromium.launch(playwrightLaunchOptions());
}
