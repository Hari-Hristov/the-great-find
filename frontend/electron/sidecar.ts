// Sidecar — spawns the Go backend binary as a child process, parses its
// startup line for the listening port, and exposes a `ready` Promise.
//
// In dev mode (TGF_BACKEND_BIN unset), the sidecar runs in "external" mode:
// it assumes a developer has the backend running themselves (e.g. via
// `cd backend && make run` in WSL2 — required on this laptop because WDAC
// blocks Windows-compiled Go binaries; see CLAUDE.md).

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import http from "node:http";

const DEFAULT_EXTERNAL_PORT = 8088;
const READY_TIMEOUT_MS = 15_000;
const HEALTH_INTERVAL_MS = 100;
const HEALTH_REQ_TIMEOUT_MS = 3_000;

const RESTART_WINDOW_MS = 60_000;
const RESTART_MAX = 1;

export type SidecarMode = "external" | "spawned";

export interface SidecarReady {
  mode: SidecarMode;
  port: number;
}

interface SidecarOpts {
  dataDir?: string;
}

export class Sidecar extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private readyPort: number | null = null;
  private mode: SidecarMode = "external";
  private restarts: number[] = [];
  private stopping = false;
  private opts: SidecarOpts = {};

  /**
   * Resolves once the backend is reachable. Idempotent — subsequent calls
   * return the cached port without restarting anything.
   */
  async start(opts: SidecarOpts = {}): Promise<SidecarReady> {
    this.opts = opts;
    if (this.readyPort != null) {
      return { mode: this.mode, port: this.readyPort };
    }

    const binPath = resolveBinaryPath();
    if (!binPath) {
      this.mode = "external";
      const port = DEFAULT_EXTERNAL_PORT;
      await waitForHealth(port);
      this.readyPort = port;
      this.emit("ready", port);
      return { mode: "external", port };
    }

    this.mode = "spawned";
    return this.spawnAndWait(binPath);
  }

  private async spawnAndWait(binPath: string): Promise<SidecarReady> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BACKEND_PORT: "0",
      THE_GREAT_FIND_DATA_DIR: this.opts.dataDir ?? "",
    };

    const proc = spawn(binPath, [], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc = proc;

    const portFromStdout = parsePortFromStream(proc.stdout);
    const portFromStderr = parsePortFromStream(proc.stderr);
    const portFromHealth = pollHealthForPort();
    const portRace = Promise.race([
      portFromStdout,
      portFromStderr,
      portFromHealth,
    ]);

    const timeoutMs = READY_TIMEOUT_MS;
    const port = await Promise.race([
      portRace,
      new Promise<number>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`sidecar did not become ready in ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    this.readyPort = port;
    this.emit("ready", port);

    proc.on("exit", (code, signal) => {
      this.proc = null;
      this.readyPort = null;
      if (this.stopping) return;
      console.error(
        `[sidecar] exited unexpectedly (code=${code}, signal=${signal})`,
      );
      this.emit("crashed", { code, signal });
      this.maybeRestart(binPath);
    });

    return { mode: "spawned", port };
  }

  private maybeRestart(binPath: string): void {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= RESTART_MAX) {
      console.error(
        "[sidecar] too many crashes in window, giving up",
        this.restarts.length,
      );
      this.emit("dead");
      return;
    }
    this.restarts.push(now);
    console.warn("[sidecar] attempting restart");
    this.spawnAndWait(binPath).catch((err) => {
      console.error("[sidecar] restart failed:", err);
      this.emit("dead");
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const proc = this.proc;
    if (!proc) return;
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      }, 5_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  port(): number | null {
    return this.readyPort;
  }
}

function resolveBinaryPath(): string | null {
  const override = process.env.TGF_BACKEND_BIN;
  if (override && override.length > 0) {
    return override;
  }

  // `app.isPackaged` is not available here without importing electron in
  // tests; we rely on the convention that packaged builds set
  // process.resourcesPath inside Electron's runtime.
  const resources = process.resourcesPath;
  if (!resources || resources.includes("electron-vite")) {
    return null;
  }

  let binName: string;
  if (process.platform === "win32") {
    binName = "the-great-find.exe";
  } else if (process.platform === "darwin") {
    binName =
      process.arch === "arm64" ? "the-great-find-arm64" : "the-great-find-amd64";
  } else {
    binName = "the-great-find";
  }
  return path.join(resources, binName);
}

function parsePortFromStream(
  stream: NodeJS.ReadableStream,
): Promise<number> {
  return new Promise((resolve) => {
    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        // The backend logs via slog in key=value form: `url=http://127.0.0.1:NNNN`
        // or as JSON, depending on handler. Try both.
        const m =
          line.match(/url=http:\/\/127\.0\.0\.1:(\d+)/) ??
          line.match(/"url":"http:\/\/127\.0\.0\.1:(\d+)"/);
        if (m) {
          resolve(Number(m[1]));
          return;
        }
        // Surface backend logs so dev gets them in the Electron console.
        if (line.trim().length > 0) {
          console.log("[backend]", line);
        }
      }
    });
  });
}

function pollHealthForPort(): Promise<number> {
  // The backend chooses a port at random when BACKEND_PORT=0; we don't know
  // it until either stdout reveals it or we read a port-file. As a backup,
  // probe the default :8088 in case the user is running the dev backend.
  return new Promise((resolve) => {
    const port = DEFAULT_EXTERNAL_PORT;
    const tryOnce = () => {
      const req = http.get(
        `http://127.0.0.1:${port}/healthz`,
        { timeout: HEALTH_REQ_TIMEOUT_MS },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve(port);
          } else {
            setTimeout(tryOnce, HEALTH_INTERVAL_MS);
          }
        },
      );
      req.on("error", () => setTimeout(tryOnce, HEALTH_INTERVAL_MS));
      req.on("timeout", () => {
        req.destroy();
        setTimeout(tryOnce, HEALTH_INTERVAL_MS);
      });
    };
    tryOnce();
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ok = await healthOnce(port);
    if (ok) return;
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  throw new Error(
    `external backend on :${port} never responded to /healthz within ${READY_TIMEOUT_MS}ms`,
  );
}

function healthOnce(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/healthz`,
      { timeout: HEALTH_REQ_TIMEOUT_MS },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
