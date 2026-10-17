import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
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

/**
 * Downloads chromium-headless-shell the first time it is missing, so a fresh
 * install renders without a separate `playwright install` step.
 */
export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch(playwrightLaunchOptions());
  } catch (error) {
    if (!(error instanceof Error) || !isMissingBrowser(error.message)) throw error;
    await installHeadlessShell();
    return chromium.launch(playwrightLaunchOptions());
  }
}

export function isMissingBrowser(message: string): boolean {
  return message.includes("Executable doesn't exist");
}

async function installHeadlessShell(): Promise<void> {
  // cli.js is not in playwright's exports, so find it beside package.json.
  const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
  console.error("automedia: downloading Chromium for rendering, once");
  await promisify(execFile)(process.execPath, [cli, "install", "chromium-headless-shell"], {
    windowsHide: true,
  });
}
