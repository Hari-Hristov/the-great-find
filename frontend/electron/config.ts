// Persisted app config — lives at `app.getPath("userData")/config.json`.
//
// Only the main process touches the file. The renderer interacts via IPC.

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./types";

const FILE_NAME = "config.json";

function configPath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as AppConfig;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("[config] read failed, using defaults:", err);
    }
  }
  return {};
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  const file = configPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cfg, null, 2), "utf8");
}

export async function updateConfig(
  patch: Partial<AppConfig>,
): Promise<AppConfig> {
  const current = await loadConfig();
  const next: AppConfig = { ...current, ...patch };
  await saveConfig(next);
  return next;
}
