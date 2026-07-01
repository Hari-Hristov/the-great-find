// The renderer talks to the Go backend via this client. The base URL depends
// on where the renderer is hosted:
//
//   - browser dev (`npm run dev`): "/api" — Vite proxies to 127.0.0.1:8088
//   - Electron dev (`npm run dev:electron`): "/api" — same Vite proxy. The
//     renderer runs on http://localhost:5173, so going absolute to
//     http://127.0.0.1:<port> would trip CORS (browser treats localhost vs
//     127.0.0.1 as different origins, and the backend correctly refuses to
//     serve CORS headers to arbitrary origins — see below).
//   - packaged Electron: "http://127.0.0.1:<port>/api" where <port> is
//     whatever port the sidecar grabbed (BACKEND_PORT=0 → OS-assigned).
//     Chromium doesn't enforce CORS for file:// → http://127.0.0.1 fetches,
//     so the absolute URL works.
//
// The backend intentionally does NOT set CORS headers. Doing so would let
// any website you visit in your regular browser hit your local API — the
// 127.0.0.1 bind is not a defense against a browser on the same machine
// executing hostile JS. Same-origin (via file:// or the Vite proxy) is the
// invariant we rely on.

let baseUrl = "/api";

// If the preload bridge is broken (bad IPC registration, main-process
// panic before the handler was wired), the getBackendPort() promise can
// hang forever and block the app from ever mounting. Race it against a
// short timeout and fall back to the "/api" default (which will 404 in
// packaged builds but at least renders an error state).
const BRIDGE_TIMEOUT_MS = 10_000;

/**
 * Initialise the API base URL. Called once at app startup.
 *
 * - Browser dev: no bridge → early-return, keep "/api" (Vite proxy handles it).
 * - Electron dev: bridge exists BUT the renderer is on the Vite dev server
 *   (http://localhost:5173). Going absolute to http://127.0.0.1 would be
 *   cross-origin and CORS-blocked. Keep "/api" so the Vite dev proxy handles
 *   the routing same-origin.
 * - Packaged Electron: bridge exists, renderer is file://, no CORS
 *   enforcement → resolve the sidecar port and go absolute.
 */
export async function initApiBaseUrl(): Promise<void> {
  const bridge = typeof window !== "undefined" ? window.tgf : undefined;
  if (!bridge) return;

  // In dev the Vite proxy is what makes /api reachable. Going absolute
  // here would break with CORS because the renderer is served from
  // localhost:5173, not from file://.
  if (import.meta.env.DEV) return;

  try {
    const port = await Promise.race([
      bridge.getBackendPort(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`backend port resolution timed out after ${BRIDGE_TIMEOUT_MS}ms`)),
          BRIDGE_TIMEOUT_MS,
        ),
      ),
    ]);
    baseUrl = `http://127.0.0.1:${port}/api`;
    bridge.onBackendReady((nextPort) => {
      baseUrl = `http://127.0.0.1:${nextPort}/api`;
    });
  } catch (err) {
    console.warn("[api] failed to resolve backend port via bridge:", err);
  }
}

/** Returns the resolved base URL for routes that need to build their own URLs (e.g. SSE). */
export function getApiBaseUrl(): string {
  return baseUrl;
}

/** Returns the resolved origin (no trailing /api) for the SSE event stream. */
export function getBackendOrigin(): string {
  if (baseUrl === "/api") return "";
  return baseUrl.replace(/\/api$/, "");
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

type FetchOpts = RequestInit & { json?: unknown };

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };

  const res = await fetch(`${baseUrl}${path}`, init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = undefined;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }
  return payload as T;
}
