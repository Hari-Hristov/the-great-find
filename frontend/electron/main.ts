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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sidecar } from "./sidecar";
import { createTray } from "./tray";
import { loadConfig, updateConfig } from "./config";

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
  console.log("[main] __dirname:", __dirname);
  console.log("[main] preload path:", preloadPath);

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
      sandbox: false,
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (e, url) => {
    const target = new URL(url);
    const currentUrl =
      process.env.ELECTRON_RENDERER_URL ?? win.webContents.getURL();
    // Only intercept when the navigation would take us OFF the app's own
    // origin (Vite dev server in dev, file:// in packaged). Same-origin
    // navigation is TanStack Router doing its thing.
    let currentOrigin = "";
    try {
      currentOrigin = new URL(currentUrl).origin;
    } catch {
      currentOrigin = "";
    }
    if (target.origin !== currentOrigin) {
      e.preventDefault();
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
  ipcMain.handle("backend:port", async () => {
    const p = sidecar.port();
    if (p != null) return p;
    const ready = await sidecar.start();
    return ready.port;
  });

  ipcMain.handle("config:getDataDir", async () => {
    const cfg = await loadConfig();
    return cfg.dataDir;
  });
  ipcMain.handle("config:setDataDir", async (_e, p: string) => {
    await updateConfig({ dataDir: p });
  });
  ipcMain.handle("config:getOsNotifications", async () => {
    const cfg = await loadConfig();
    return cfg.osNotifications ?? true;
  });
  ipcMain.handle("config:setOsNotifications", async (_e, enabled: boolean) => {
    await updateConfig({ osNotifications: enabled });
  });

  ipcMain.handle("dialog:pickDir", async () => {
    if (!mainWindow) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose data directory",
    });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return result.filePaths[0];
  });

  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle("app:hide", () => {
    hideWindow();
  });
  ipcMain.handle("app:platform", () => process.platform);
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
