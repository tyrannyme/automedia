declare module "electron-forge-maker-appimage" {
  export default function makeAppImage(options: {
    dir: string;
    makeDir: string;
    appName: string;
    targetArch: string;
    targetPlatform: string;
  }): Promise<string[]>;
}
