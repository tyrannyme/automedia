import { chromium, type Browser, type LaunchOptions } from "playwright";

export function webGpuArgs(): string[] {
  return ["--enable-unsafe-webgpu"];
}

export function playwrightLaunchOptions(): LaunchOptions {
  return {
    executablePath: chromium.executablePath(),
    handleSIGINT: false,
    handleSIGTERM: false,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", ...webGpuArgs()],
  };
}

export async function launchChromium(): Promise<Browser> {
  return chromium.launch(playwrightLaunchOptions());
}
