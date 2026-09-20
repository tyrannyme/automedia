import path from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { startLoopbackServer } from "./http.ts";
import { registerIpcHandlers } from "./ipc.ts";
import { createMcpServer } from "./mcp.ts";
import { CompositionStore } from "./store.ts";
import { subscribeThumbnailMutations, ThumbnailService } from "./thumbnails.ts";
import { loopbackHost, loopbackPort } from "@shared/limits.ts";
import { cdpOrigin, resolveCdpPort } from "./cdp.ts";

app.enableSandbox();

// CDP stays on localhost so agents can attach.
app.commandLine.appendSwitch("remote-debugging-port", String(resolveCdpPort()));
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-unsafe-webgpu");

let loopback: Awaited<ReturnType<typeof startLoopbackServer>> | undefined;
let thumbnails: ThumbnailService | undefined;
let unsubscribeThumbnailEvents: (() => void) | undefined;
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
  const store = new CompositionStore(app.getPath("userData"));
  const events = new EventBus();
  const loopbackUrl = () => loopback?.url ?? `http://${loopbackHost}:${loopbackPort}`;
  const exports = new ExportQueue(
    store,
    (job) => {
      events.emit({ type: "export", compositionId: job.compositionId, payload: job });
    },
    loopbackUrl,
  );
  const mcp = createMcpServer({ store, exports, events, loopbackUrl });
  registerIpcHandlers({
    store,
    queue: exports,
    events,
    userData: app.getPath("userData"),
    loopbackUrl,
    loopSeam: async (compositionId) => {
      if (!thumbnails) throw new Error("loop seam is not ready");
      return { match: await thumbnails.compareLoopSeam(compositionId) };
    },
  });
  void startLoopbackServer({ store, mcp, events, exports })
    .then((server) => {
      loopback = server;
      thumbnails = new ThumbnailService(store, {
        baseUrl: server.url,
        onReady: (compositionId) => {
          events.emit({ type: "thumbnail_ready", compositionId });
        },
        onError: (compositionId, error) => {
          console.error(`failed to generate thumbnail for ${compositionId}`, error);
          events.emit({
            type: "thumbnail_error",
            compositionId,
            payload: { code: "internal", message: error.message },
          });
        },
      });
      unsubscribeThumbnailEvents = subscribeThumbnailMutations(events, thumbnails);
      // Existing projects are upgraded lazily in the background. App startup
      // and the first paint never wait on Chromium or thumbnail I/O.
      void thumbnails.backfill().catch((error) => {
        console.error("failed to backfill composition thumbnails", error);
      });
      createWindow(server.port);
      console.log(`cdp ${cdpOrigin()}`);
    })
    .catch((error) => {
      console.error("failed to start loopback server", error);
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && loopback) {
    createWindow(loopback.port);
  }
});

app.on("before-quit", (event) => {
  if (shutdownPromise) return;
  event.preventDefault();
  unsubscribeThumbnailEvents?.();
  unsubscribeThumbnailEvents = undefined;
  shutdownPromise = Promise.allSettled([thumbnails?.close(), loopback?.close()]).then(() => {
    app.quit();
  });
});
