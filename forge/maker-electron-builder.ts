import { MakerBase, type MakerOptions } from "@electron-forge/maker-base";
import { buildForge, type PackagerOptions, type PublishOptions } from "app-builder-lib";

/** Hands Forge's packaged app to an electron-builder target. */
abstract class MakerElectronBuilder extends MakerBase<Record<string, never>> {
  abstract target: string;
  abstract defaultPlatforms: ["linux"] | ["win32"];

  isSupportedOnCurrentPlatform(): boolean {
    return process.platform === this.defaultPlatforms[0];
  }

  async make(opts: MakerOptions): Promise<string[]> {
    const targets = [`${this.target}:${opts.targetArch}`];
    const buildOptions = {
      ...(opts.targetPlatform === "win32" ? { win: targets } : { linux: targets }),
      publish: "never",
    } satisfies PackagerOptions & PublishOptions;
    const artifacts = await buildForge({ dir: opts.dir }, buildOptions);
    return artifacts;
  }
}

export class MakerAppImage extends MakerElectronBuilder {
  name = "appimage";
  target = "appimage";
  defaultPlatforms: ["linux"] = ["linux"];
}

export class MakerNSIS extends MakerElectronBuilder {
  name = "nsis";
  target = "nsis";
  defaultPlatforms: ["win32"] = ["win32"];
}
