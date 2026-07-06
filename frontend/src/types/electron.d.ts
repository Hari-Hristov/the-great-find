// Ambient type for the optional `window.tgf` bridge.
//
// Made optional so browser-only dev (`npm run dev`) still typechecks — the
// bridge is only present when the renderer is hosted inside Electron. The
// shape is duplicated from `electron/types.ts` on purpose: the renderer
// tsconfig excludes the `electron/` source dir, so we can't import from
// there.

declare global {
  interface TgfBridge {
    getBackendPort: () => Promise<number>;
    onBackendReady: (cb: (port: number) => void) => void;
    getDataDir: () => Promise<string | undefined>;
    setDataDir: (path: string) => Promise<void>;
    pickDirectory: () => Promise<string | undefined>;
    setOsNotifications: (enabled: boolean) => Promise<void>;
    getOsNotifications: () => Promise<boolean>;
    getSetupCompleted: () => Promise<boolean>;
    setSetupCompleted: (done: boolean) => Promise<void>;
    quitApp: () => Promise<void>;
    hideWindow: () => Promise<void>;
    getPlatform: () => Promise<"win32" | "darwin" | "linux" | "aix" | "freebsd" | "openbsd" | "sunos" | "android" | "cygwin" | "netbsd" | "haiku">;
    isElectron: () => true;
  }

  interface Window {
    tgf?: TgfBridge;
  }
}

export {};
