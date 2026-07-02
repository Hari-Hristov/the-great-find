// Shared types for the electron main <-> renderer bridge.
//
// Anything exposed to the renderer through preload.ts must be declared here
// so the renderer can import a single source of truth.

export interface AppConfig {
  /** Override for THE_GREAT_FIND_DATA_DIR. Applied on next launch. */
  dataDir?: string;
  /** Whether OS-level notifications are allowed. Default true. */
  osNotifications?: boolean;
}

export interface TgfBridge {
  /** Resolves once the backend has reported a listening port. */
  getBackendPort: () => Promise<number>;
  /** Subscribe to backend-ready events (e.g. after a sidecar restart). */
  onBackendReady: (cb: (port: number) => void) => void;

  getDataDir: () => Promise<string | undefined>;
  setDataDir: (path: string) => Promise<void>;
  pickDirectory: () => Promise<string | undefined>;

  setOsNotifications: (enabled: boolean) => Promise<void>;
  getOsNotifications: () => Promise<boolean>;

  quitApp: () => Promise<void>;
  hideWindow: () => Promise<void>;
  /** The Electron main process's `process.platform` — reliable, not deprecated. */
  getPlatform: () => Promise<NodeJS.Platform>;
  isElectron: () => true;
}
