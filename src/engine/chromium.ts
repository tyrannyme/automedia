import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
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
export function playwrightLaunchOptions(extraArgs: string[] = []): LaunchOptions {
  const options: LaunchOptions = {
    handleSIGINT: false,
    handleSIGTERM: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      ...webGpuArgs(),
      ...extraArgs,
    ],
  };
  const executablePath = configuredChromiumPath();
  if (executablePath) options.executablePath = executablePath;
  return options;
}

/**
 * Downloads chromium-headless-shell the first time it is missing, so a fresh
 * install renders without a separate `playwright install` step, unless
 * PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set.
 */
export async function launchChromium(extraArgs: string[] = []): Promise<Browser> {
  const options = playwrightLaunchOptions(extraArgs);
  try {
    return await chromium.launch(options);
  } catch (error) {
    // An explicit executable is authoritative: never download a different browser
    // or silently mask an invalid/incompatible cloud image.
    if (options.executablePath) {
      throw new Error(
        `Could not launch AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH (${options.executablePath}). Use a compatible Chromium headless shell and check host process permissions.`,
        { cause: error },
      );
    }
    if (!(error instanceof Error) || !isMissingBrowser(error.message)) throw error;
    // Playwright's own switch for "never download browsers", which CI sets.
    if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) throw error;
    await installHeadlessShell();
    return chromium.launch(options);
  }
}

/** An optional pre-provisioned browser, shared by stills, validation and video. */
function configuredChromiumPath(): string | undefined {
  const executablePath = process.env.AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH;
  if (!executablePath) return undefined;
  if (!path.isAbsolute(executablePath)) {
    throw new Error("AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH must be an absolute executable path.");
  }
  try {
    if (!statSync(executablePath).isFile()) throw new Error("not a regular file");
    accessSync(executablePath, process.platform === "win32" ? constants.F_OK : constants.X_OK);
  } catch (cause) {
    throw new Error(
      `AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH is not an accessible executable file: ${executablePath}`,
      { cause },
    );
  }
  return executablePath;
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
