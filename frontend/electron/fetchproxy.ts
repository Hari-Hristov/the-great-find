// Electron-mediated fetch proxy — the browser-side half of the fix for
// olx.bg's CDN (CloudFront) blocking Go's net/http on TLS/HTTP2 fingerprint
// alone (see issue #98). Go POSTs a fetch envelope here; this module issues
// the actual request through Electron's own Chromium network stack (a real
// browser engine the app already ships and keeps resident in the tray — not
// fingerprint spoofing) and hands the response back as a JSON envelope.
//
// Treat this listener as hostile-adjacent even though it only talks to our
// own Go sidecar: it's a loopback HTTP server, and loopback servers are
// reachable by any local process (or, via DNS rebinding, a malicious web
// page). Every request is checked in order: bearer token, Host header,
// method, then a hardcoded (not request-derived) URL allowlist.
//
// Never reachable from the renderer — no preload/contextBridge/ipcMain
// wiring exists for this. It is main-process (Node http server) <-> Go only.
import { session } from "electron";
import crypto from "node:crypto";
import http from "node:http";

/** No `persist:` prefix — nothing in this session ever touches disk, and it
 * evaporates on quit. Keeps olx.bg cookies fully separate from the app's
 * default session. */
const PARTITION = "tgf-olx";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_REQUEST_BYTES = 64 * 1024; // 64 KB

interface FetchEnvelopeRequest {
  url?: unknown;
  method?: unknown;
  headers?: unknown;
}

let server: http.Server | null = null;
let token = "";

/** Starts the loopback listener. Resolves with the OS-assigned port and a
 * fresh 32-byte hex bearer token, both of which the caller must pass into
 * the Go sidecar's environment (TGF_FETCH_PROXY / TGF_FETCH_PROXY_TOKEN). */
export async function start(): Promise<{ port: number; token: string }> {
  if (server) {
    throw new Error("fetchproxy: already started");
  }
  token = crypto.randomBytes(32).toString("hex");

  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      void handleRequest(req, res, srv);
    });
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("fetchproxy: failed to bind loopback listener"));
        return;
      }
      server = srv;
      resolve({ port: addr.port, token });
    });
  });
}

export async function stop(): Promise<void> {
  const srv = server;
  server = null;
  if (!srv) return;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  srv: http.Server,
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/fetch") {
    sendError(res, 404, "not found");
    return;
  }

  if (!isAuthorized(req)) {
    sendError(res, 401, "unauthorized");
    return;
  }

  if (!isAllowedHost(req, srv)) {
    sendError(res, 403, "forbidden host");
    return;
  }

  let rawBody: string;
  try {
    rawBody = await readCappedBody(req, MAX_REQUEST_BYTES);
  } catch {
    sendError(res, 413, "request too large");
    return;
  }

  let envelope: FetchEnvelopeRequest;
  try {
    envelope = JSON.parse(rawBody) as FetchEnvelopeRequest;
  } catch {
    sendError(res, 400, "malformed request body");
    return;
  }

  const targetUrl = typeof envelope.url === "string" ? envelope.url : "";
  const method = typeof envelope.method === "string" ? envelope.method : "";
  const headers = isHeaderRecord(envelope.headers) ? envelope.headers : {};

  if (method !== "GET") {
    sendError(res, 405, "method not allowed");
    return;
  }

  if (!isAllowedTarget(targetUrl)) {
    sendError(res, 400, "target not allowed");
    return;
  }

  try {
    const upstream = await session.fromPartition(PARTITION).fetch(targetUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const bodyBytes = await readCappedStream(upstream.body, MAX_RESPONSE_BYTES);
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    sendJSON(res, 200, {
      status: upstream.status,
      headers: responseHeaders,
      body_b64: Buffer.from(bodyBytes).toString("base64"),
    });
  } catch (err) {
    // Fixed generic reason only — never echo the target URL (or any request
    // detail) into a client-visible error string.
    console.error("[fetchproxy] upstream fetch failed:", err);
    sendError(res, 502, "fetch failed");
  }
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(token, "utf8");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function isAllowedHost(req: http.IncomingMessage, srv: http.Server): boolean {
  const addr = srv.address();
  if (addr === null || typeof addr === "string") return false;
  return req.headers.host === `127.0.0.1:${addr.port}`;
}

function isHeaderRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

// Hardcoded here, NOT derivable from the request body — a compromised or
// buggy Go caller cannot widen this list at runtime. A future non-OLX parser
// target must widen this allowlist here, deliberately, in code.
function isAllowedTarget(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return u.hostname === "olx.bg" || u.hostname.endsWith(".olx.bg");
}

function readCappedBody(
  req: http.IncomingMessage,
  capBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > capBytes) {
        req.destroy();
        reject(new Error("fetchproxy: request body exceeds cap"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readCappedStream(
  stream: ReadableStream<Uint8Array> | null,
  capBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > capBytes) {
        await reader.cancel();
        throw new Error("fetchproxy: response body exceeds cap");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function sendJSON(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJSON(res, status, { error: message });
}
