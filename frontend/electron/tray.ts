// Tray — single click toggles the main window, right click opens a context
// menu (Open / Quit).

import { Tray, Menu, nativeImage, type BrowserWindow } from "electron";
import path from "node:path";

export interface TrayDeps {
  getWindow: () => BrowserWindow | null;
  showWindow: () => void;
  hideWindow: () => void;
  quit: () => void;
}

export function createTray(deps: TrayDeps): Tray {
  const iconPath = resolveTrayIconPath();
  const image = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }
  const tray = new Tray(image);
  tray.setToolTip("The Great Find");

  const toggle = () => {
    const win = deps.getWindow();
    if (!win) {
      deps.showWindow();
      return;
    }
    if (win.isVisible() && !win.isMinimized()) {
      deps.hideWindow();
    } else {
      deps.showWindow();
    }
  };

  tray.on("click", toggle);
  // On Windows, double-click is a more conventional toggle gesture; mirror
  // the behaviour so users on either path land somewhere sensible.
  tray.on("double-click", toggle);

  const menu = Menu.buildFromTemplate([
    { label: "Open The Great Find", click: () => deps.showWindow() },
    { type: "separator" },
    { label: "Quit", click: () => deps.quit() },
  ]);
  tray.setContextMenu(menu);

  return tray;
}

function resolveTrayIconPath(): string {
  // Packaged: extraResources places icons in the build/ dir which
  // electron-builder copies into the app's `buildResources`. Dev: read from
  // the source tree.
  const filename =
    process.platform === "darwin"
      ? "tray-icon-Template@2x.png"
      : "tray-icon.png";
  if (process.resourcesPath && !process.resourcesPath.includes("electron-vite")) {
    return path.join(process.resourcesPath, filename);
  }
  return path.resolve(__dirname, "..", "..", "build", filename);
}
