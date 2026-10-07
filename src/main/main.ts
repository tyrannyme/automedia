import path from "node:path";
import { app, BrowserWindow, dialog, nativeTheme } from "electron";
import { resolveLoopbackPort } from "../engine/loopback.ts";
import { cdpOrigin, resolveCdpPort } from "./cdp.ts";
import { connectStudioEngine, type StudioEngine } from "./engine-process.ts";
import { registerIpcHandlers } from "./ipc.ts";
import { startUpdates } from "./updates.ts";

app.enableSandbox();

// CDP stays on localhost so agents can attach to the studio window.
app.commandLine.appendSwitch("remote-debugging-port", String(resolveCdpPort()));
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-unsafe-webgpu");

let studioEngine: StudioEngine | undefined;
let shutdownPromise: Promise<void> | undefined;
const titleBarHeight = 44;
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(app.getAppPath(), "assets", "icon.png");

function canvasColor(): string {
  return nativeTheme.shouldUseDarkColors ? "#000000" : "#FFFFFF";
}

function titleBarOverlay(): Electron.TitleBarOverlay {
  return {
    height: titleBarHeight,
    color: canvasColor(),
    symbolColor: nativeTheme.shouldUseDarkColors ? "#F5F5F5" : "#171717",
  };
}

function applyNativeAppearance(window: BrowserWindow): void {
  window.setBackgroundColor(canvasColor());
  if (process.platform !== "darwin") {
    window.setTitleBarOverlay(titleBarOverlay());
  }
}

function createWindow(loopbackPortValue: number): void {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Automedia",
    icon: appIconPath,
    titleBarStyle: "hidden",
    backgroundColor: canvasColor(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--automedia-loopback-port=${loopbackPortValue}`],
    },
  };
  if (process.platform !== "darwin") {
    windowOptions.titleBarOverlay = titleBarOverlay();
  }
  const mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on("ready", () => {
  nativeTheme.on("updated", () => {
    for (const window of BrowserWindow.getAllWindows()) {
      applyNativeAppearance(window);
    }
  });
  // The library lives in userData, so --user-data-dir picks another one.
  const userData = app.getPath("userData");
  const target = { port: resolveLoopbackPort(), library: userData, explicitLibrary: true };
  void connectStudioEngine(target)
    .then((connected) => {
      studioEngine = connected;
      registerIpcHandlers(connected.engine, userData);
      startUpdates();
      createWindow(connected.port);
      console.log(`cdp ${cdpOrigin()}`);
    })
    .catch((error) => {
      console.error("failed to start the engine", error);
      dialog.showErrorBox(
        "Automedia could not start its engine",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && studioEngine) {
    createWindow(studioEngine.port);
  }
});

app.on("before-quit", (event) => {
  if (shutdownPromise) return;
  event.preventDefault();
  shutdownPromise = Promise.allSettled([studioEngine?.close()]).then(() => {
    app.quit();
  });
});
