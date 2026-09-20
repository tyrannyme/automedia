import { MakerBase, type MakerOptions } from "@electron-forge/maker-base";
import makeAppImage from "electron-forge-maker-appimage";

export class MakerAppImage extends MakerBase<Record<string, never>> {
  name = "appimage";
  defaultPlatforms: ["linux"] = ["linux"];

  isSupportedOnCurrentPlatform(): boolean {
    return process.platform === "linux";
  }

  async make(opts: MakerOptions): Promise<string[]> {
    const artifacts = await makeAppImage({
      dir: opts.dir,
      makeDir: opts.makeDir,
      appName: opts.appName,
      targetArch: opts.targetArch,
      targetPlatform: opts.targetPlatform,
    });
    return artifacts;
  }
}
