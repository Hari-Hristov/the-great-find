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

  await sidecar.start({ dataDir: cfg.dataDir });

  createMainWindow();

  tray = createTray({
    getWindow: () => mainWindow,
    showWindow,
    hideWindow,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
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
    if (sidecar.port() == null) return;
    e.preventDefault();
    isQuitting = true;
    await sidecar.stop();
    app.exit(0);
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#0a0a0a",
    title: "The Great Find",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
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

  // Open external links in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
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
  ipcMain.handle("app:version", () => app.getVersion());
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

// Make sure we never leak the sidecar.
app.on("quit", () => {
  void sidecar.stop();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
