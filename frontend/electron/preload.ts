// Preload script — runs in an isolated world, has access to both Node and the
// renderer's window. Exposes a frozen, whitelisted `window.tgf` bridge.

import { contextBridge, ipcRenderer } from "electron";
import type { TgfBridge } from "./types";

const bridge: TgfBridge = {
  getBackendPort: () => ipcRenderer.invoke("backend:port") as Promise<number>,
  onBackendReady: (cb) => {
    ipcRenderer.on("backend:ready", (_e, port: number) => cb(port));
  },

  getDataDir: () =>
    ipcRenderer.invoke("config:getDataDir") as Promise<string | undefined>,
  setDataDir: (p) =>
    ipcRenderer.invoke("config:setDataDir", p) as Promise<void>,
  pickDirectory: () =>
    ipcRenderer.invoke("dialog:pickDir") as Promise<string | undefined>,

  setOsNotifications: (b) =>
    ipcRenderer.invoke("config:setOsNotifications", b) as Promise<void>,
  getOsNotifications: () =>
    ipcRenderer.invoke("config:getOsNotifications") as Promise<boolean>,

  quitApp: () => ipcRenderer.invoke("app:quit") as Promise<void>,
  hideWindow: () => ipcRenderer.invoke("app:hide") as Promise<void>,
  getPlatform: () =>
    ipcRenderer.invoke("app:platform") as Promise<NodeJS.Platform>,
  isElectron: () => true as const,
};

contextBridge.exposeInMainWorld("tgf", bridge);
