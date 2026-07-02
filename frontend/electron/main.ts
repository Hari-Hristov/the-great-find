// Main process — orchestrator. Owns window/tray/sidecar lifecycle and the
// IPC handlers backing the renderer's `window.tgf` bridge.

import {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  dialog,
  shell,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sidecar } from "./sidecar";
import { createTray } from "./tray";
import { loadConfig, updateConfig } from "./config";
import { initAutoUpdater } from "./updater";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const sidecar = new Sidecar();

// `isQuitting` is the gate that distinguishes a user-requested quit (via the
// tray menu) from a window close (which only hides the window).
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
  bootstrap().catch((err) => {
    console.error("[main] fatal:", err);
    dialog.showErrorBox(
      "The Great Find — startup error",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
  });
}

async function bootstrap() {
  await app.whenReady();

  const cfg = await loadConfig();

  registerIpc();

  await sidecar.start({ dataDir: cfg.dataDir, isPackaged: app.isPackaged });

  createMainWindow();

  tray = createTray({
    getWindow: () => mainWindow,
    showWindow,
    hideWindow,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
    isPackaged: app.isPackaged,
  });

  if (process.platform === "darwin") {
    // Pure menu-bar app. LSUIElement=true in electron-builder reinforces this
    // for packaged builds; the dev override here keeps both environments
    // consistent.
    app.dock?.hide();
  }

  initAutoUpdater();

  // Forward subsequent sidecar restarts so the renderer can re-derive the
  // backend base URL without a reload.
  sidecar.on("ready", (port: number) => {
    mainWindow?.webContents.send("backend:ready", port);
  });
  sidecar.on("dead", () => {
    dialog.showErrorBox(
      "The Great Find — backend stopped",
      "The Great Find backend crashed and could not be restarted. Please restart the app.",
    );
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showWindow();
    }
  });

  app.on("before-quit", async (e) => {
    // Only run this once — after we've awaited the sidecar and called
    // app.exit(0), the OS-level cleanup handles everything else. `app.exit`
    // does NOT emit `will-quit`/`quit`, so anything that needed to run on
    // those events must run here.
    if (sidecar.port() == null) return;
    e.preventDefault();
    isQuitting = true;
    await sidecar.stop();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.exit(0);
  });
}

function createMainWindow() {
  // electron-vite emits main + preload into out/{main,preload}/ in both dev
  // and packaged mode. `__dirname` for the running main script is out/main/,
  // so the preload lives one level up in out/preload/index.cjs.
  //
  // Extension is .cjs (not .js) because frontend/package.json declares
  // "type": "module" — a bare .js file would be treated as ESM, and
  // Electron's preload loader uses synchronous require() which only
  // supports CommonJS.
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");
  if (!app.isPackaged) {
    // Dev-only trace of where the main process resolves its preload from.
    // Suppressed in packaged builds so the log never leaks the install
    // layout to whoever's reading the app's stdout.
    console.log("[main] __dirname:", __dirname);
    console.log("[main] preload path:", preloadPath);
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#0a0a0a",
    title: "The Great Find",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true means the renderer process runs with Chromium's OS-level
      // sandbox. contextIsolation alone doesn't equal a sandbox — it isolates
      // the preload's JS world from the page's, but the renderer process
      // itself still has Node capabilities unless sandboxed. The preload here
      // only uses contextBridge + ipcRenderer, both of which work fine under
      // sandbox, so nothing is lost.
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // External-link handling — two layers:
  //   1. `setWindowOpenHandler` catches target="_blank" links (window.open,
  //      middle-click, cmd/ctrl-click). We punt to the system browser.
  //   2. `will-navigate` catches normal <a href> clicks that would navigate
  //      the whole app window to an external URL — same treatment.
  //
  // Without (2), clicking a plain external link would black-screen the app
  // as Electron tries to load olx.bg inside the BrowserWindow.
  //
  // Both handlers restrict which protocols can reach shell.openExternal:
  // only http/https. Otherwise a hostile URL like `javascript:...`,
  // `file:///...`, or a third-party custom scheme (`slack://`, `steam://`,
  // etc.) could be forwarded to whichever app handles it — a small but
  // real cross-app attack surface if the renderer ever gets XSS'd.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (e, url) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      e.preventDefault();
      return;
    }

    const currentUrl =
      process.env.ELECTRON_RENDERER_URL ?? win.webContents.getURL();
    let currentOrigin: string;
    try {
      currentOrigin = new URL(currentUrl).origin;
    } catch {
      currentOrigin = "";
    }

    // Same-origin navigation is TanStack Router doing its thing — let it.
    if (target.origin === currentOrigin) return;

    // Cross-origin: block the in-app navigation, punt to system browser
    // ONLY for http/https. Anything else (javascript:, file:, custom
    // app schemes) gets dropped silently.
    e.preventDefault();
    if (target.protocol === "http:" || target.protocol === "https:") {
      void shell.openExternal(url);
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow = win;
}

function showWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  mainWindow?.hide();
}

function registerIpc() {
  ipcMain.handle("backend:port", guarded(async () => {
    const p = sidecar.port();
    if (p != null) return p;
    const ready = await sidecar.start();
    return ready.port;
  }));

  ipcMain.handle("config:getDataDir", guarded(async () => {
    const cfg = await loadConfig();
    return cfg.dataDir;
  }));
  ipcMain.handle("config:setDataDir", guarded(async (_e, p: string) => {
    await updateConfig({ dataDir: p });
  }));
  ipcMain.handle("config:getOsNotifications", guarded(async () => {
    const cfg = await loadConfig();
    return cfg.osNotifications ?? true;
  }));
  ipcMain.handle("config:setOsNotifications", guarded(async (_e, enabled: boolean) => {
    await updateConfig({ osNotifications: enabled });
  }));

  ipcMain.handle("dialog:pickDir", guarded(async () => {
    if (!mainWindow) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose data directory",
    });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return result.filePaths[0];
  }));

  ipcMain.handle("app:quit", guarded(() => {
    isQuitting = true;
    app.quit();
  }));
  ipcMain.handle("app:hide", guarded(() => {
    hideWindow();
  }));
  ipcMain.handle("app:platform", guarded(() => process.platform));
}

// Wraps an IPC handler with a frame-origin check. Every ipcMain.handle call
// goes through this so a compromised renderer (via XSS, malicious iframe, or
// hijacked preload) cannot invoke privileged main-process operations from an
// unexpected origin. Rejects any call whose sender frame isn't:
//   - file:// (packaged renderer), or
//   - http://localhost:5173 (Vite dev server we ship with).
// Rejection throws — ipcRenderer.invoke() sees a rejected promise, same as
// any other handler error.
type IpcHandler<A extends unknown[], R> = (
  event: IpcMainInvokeEvent,
  ...args: A
) => R | Promise<R>;

function guarded<A extends unknown[], R>(fn: IpcHandler<A, R>): IpcHandler<A, R> {
  return (event, ...args) => {
    if (!isAllowedFrame(event)) {
      const url = event.senderFrame?.url ?? "(no url)";
      console.warn("[ipc] rejected call from unexpected frame:", url);
      throw new Error("ipc call from unauthorized frame");
    }
    return fn(event, ...args);
  };
}

function isAllowedFrame(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  // file:// is what electron uses for packaged renderer HTML — Chromium
  // opaque-origins it, so URL comparison is prefix-based rather than exact.
  if (url.startsWith("file://")) return true;
  // Vite dev server for `npm run dev:electron`.
  if (url.startsWith("http://localhost:5173/")) return true;
  return false;
}

// All-windows-closed: do nothing on macOS (tray persists), quit elsewhere
// only when the user explicitly requested it. The window close handler
// already hides instead of closing during normal operation, so this only
// fires when the user really wants out.
app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") {
    app.quit();
  }
});
