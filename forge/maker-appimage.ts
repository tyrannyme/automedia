import { MakerBase, type MakerOptions } from "@electron-forge/maker-base";
import { buildForge, type PackagerOptions, type PublishOptions } from "app-builder-lib";

export class MakerAppImage extends MakerBase<Record<string, never>> {
  name = "appimage";
  defaultPlatforms: ["linux"] = ["linux"];

  isSupportedOnCurrentPlatform(): boolean {
    return process.platform === "linux";
  }

  async make(opts: MakerOptions): Promise<string[]> {
    const buildOptions = {
      linux: [`appimage:${opts.targetArch}`],
      publish: "never",
    } satisfies PackagerOptions & PublishOptions;
    const artifacts = await buildForge({ dir: opts.dir }, buildOptions);
    return artifacts;
  }
}
