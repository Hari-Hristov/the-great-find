// Tray — single click toggles the main window, right click opens a context
// menu (Open / Quit).

import { Tray, Menu, nativeImage, type BrowserWindow } from "electron";
import path from "node:path";

export interface TrayDeps {
  getWindow: () => BrowserWindow | null;
  showWindow: () => void;
  hideWindow: () => void;
  quit: () => void;
  /** True in packaged Electron builds, false in dev. Pass `app.isPackaged`. */
  isPackaged: boolean;
}

export function createTray(deps: TrayDeps): Tray {
  const iconPath = resolveTrayIconPath(deps.isPackaged);
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

function resolveTrayIconPath(isPackaged: boolean): string {
  const filename =
    process.platform === "darwin"
      ? "tray-icon-Template@2x.png"
      : "tray-icon.png";
  if (isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, filename);
  }
  return path.resolve(__dirname, "..", "..", "build", filename);
}
