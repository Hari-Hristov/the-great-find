# Electron — dev workflow

This document covers Phase 7: how to run, develop, and smoke-test the Electron shell that wraps the React dashboard and spawns the Go backend as a sidecar.

## Install deps (one-time)

The Electron toolchain is in `devDependencies`. From WSL2:

```bash
cd /mnt/c/Users/I762034/projects/the-great-find/frontend
npm install
```

This pulls `electron@^33`, `electron-vite@^3`, `electron-builder@^25` alongside the existing renderer deps.

## Three dev modes

### 1. Pure browser dev (no Electron)

The mode we've been using all along — fastest iteration, no native shell.

```bash
# Terminal 1 (WSL2):
cd /mnt/c/Users/I762034/projects/the-great-find/backend
make run

# Terminal 2 (anywhere):
cd /mnt/c/Users/I762034/projects/the-great-find/frontend
npm run dev          # http://localhost:5173
```

In this mode `window.tgf` is `undefined`, so the wizard's Step 2 (data dir) is read-only, and `apiFetch` uses the relative `/api` path via the Vite proxy. Everything else works.

### 2. Electron dev (renderer + native shell)

Boots the full Electron experience — tray icon, hide-to-tray, IPC bridge — pointed at the same `vite dev` renderer.

```bash
# Terminal 1 (WSL2): keep the Go backend running externally.
cd /mnt/c/Users/I762034/projects/the-great-find/backend
make run

# Terminal 2 (PowerShell or bash):
cd C:\Users\I762034\projects\the-great-find\frontend
npm run dev:electron
```

In this mode the sidecar is in **external** mode by default — `TGF_BACKEND_BIN` is unset, so the Electron main process doesn't try to spawn a Go binary, it just probes `127.0.0.1:8088` via `/healthz`. The backend in Terminal 1 covers that endpoint. The bridge yields port `8088` so the renderer's `apiFetch` becomes absolute (`http://127.0.0.1:8088/api`).

If you have a Go binary built somewhere WDAC can't see (a CI artifact, a binary built inside WSL2 then chmod-ed to executable), you can point at it:

```bash
TGF_BACKEND_BIN=/path/to/the-great-find npm run dev:electron
```

Then the Electron main process spawns it for real with `BACKEND_PORT=0`, parses the bound port from the slog startup line, and the renderer auto-picks up the right URL.

#### Known gap: WSL2-hosted backend + real olx.bg ingestion

olx.bg's CDN blocks Go's `net/http` on TLS/HTTP2 fingerprint alone, so outbound
olx.bg requests are routed through an Electron-mediated loopback fetch proxy
(`TGF_FETCH_PROXY` / `TGF_FETCH_PROXY_TOKEN` — see the root README's env var
table). That proxy listens on `127.0.0.1` on the **Windows** side. A Go
backend running via `make run` inside WSL2 (the default in mode 2 above)
cannot reach a Windows-side loopback listener, so real olx.bg ingestion will
403 in that setup after this change. This is an accepted, confirmed
trade-off — not a bug to fix here.

Two workarounds if you need real ingestion against olx.bg while developing:

1. Build/run the Go binary **natively on Windows** instead of inside WSL2 (bypasses the WDAC-driven WSL2 requirement some other way — e.g. a CI-built binary), then point `TGF_BACKEND_BIN` at it so Electron spawns it directly and injects the env vars automatically.
2. Set `TGF_BACKEND_BIN` to a binary Electron spawns itself (per the snippet above) — anything Electron spawns gets `TGF_FETCH_PROXY`/`TGF_FETCH_PROXY_TOKEN` injected into its env automatically. A separately-running external backend (mode 1, or `make run` in WSL2) never gets these injected and must be given them by hand, which doesn't help across the WSL2/Windows loopback boundary.

Everything else (fixture-backed tests, non-olx.bg-dependent development) is unaffected.

### 3. Packaged smoke test (full end-to-end)

```bash
cd /mnt/c/Users/I762034/projects/the-great-find/frontend
npm run build:electron      # bundles main/preload/renderer into out/
npm run dist:dir            # unpacked Electron app (no installer)
```

The unpacked app lives under `dist-electron/` and runs the sidecar end-to-end (needs the Go binary present in `dist/bin/<goos>-<goarch>/` — see Phase 9).

## Smoke-test checklist (Phase 7.7)

Run these by hand once the dev environment is set up.

### Wizard appears on first run

1. Wipe `the-great-find.db` from your data dir (e.g. `backend/the-great-find.db` in dev).
2. Launch the app via `npm run dev:electron`.
3. The renderer should redirect from `/dashboard` → `/wizard` automatically.
4. Walk through all 4 steps. Step 4 creates a search.
5. After Step 4 you should land on `/dashboard` with one search visible.
6. Restart the app — second launch goes straight to `/dashboard`, not the wizard.

### Wizard is keyboard-accessible

- Tab cycles Back / Skip / Next.
- `Enter` activates focused button.
- The data-dir step's "Choose folder…" opens an OS folder picker.

### Tray + lifecycle

1. With the app running, close the main window via the close button.
2. The window should hide; the tray icon stays.
3. Single-click (or double-click on Windows) the tray icon → window reappears.
4. Right-click the tray icon → menu shows `Open` and `Quit`.
5. Click `Quit` → app fully exits; verify no orphan `the-great-find` process via `ps -ef` (Linux/macOS) or Task Manager (Windows).

### Sidecar restart resilience

1. Kill the Go backend process while the app is running.
2. The Electron main process should attempt one restart; on second crash inside 60s it stops trying and shows an error dialog.

### Single-instance lock

1. Launch the app.
2. Try to launch it again — the second launch should focus the existing window instead of spawning a new one.

### Auto-updater

Runs only in packaged builds. Behaviour splits by platform:

- **Linux (AppImage)**: full electron-updater flow. Checks GitHub Releases
  on startup + every 6h, downloads new AppImages automatically, verifies
  the `.sigstore.json` bundle against the release pipeline's OIDC identity
  before install (uses `cosign` if on PATH; falls back to install-anyway
  with a warning if cosign is missing).
- **Windows / macOS**: notify-only. Polls `api.github.com/repos/.../releases/latest`
  every 6h; if a newer tag exists, posts a native Notification that opens
  the Releases page on click. No auto-download — unsigned installers can't
  be silently applied on these platforms (SmartScreen / Gatekeeper). See
  [#52](https://github.com/Hari-Hristov/the-great-find/issues/52) for the
  v2 plan around real code signing.

**Manual test (Linux)**: tag `v0.0.0-test` on a scratch branch, push, wait
for the release workflow to publish a draft. Manually mark it as latest,
then run the local packaged AppImage — the updater should offer to
install after ~30 seconds.

## Verification commands

```bash
cd /mnt/c/Users/I762034/projects/the-great-find/frontend
npm run typecheck        # both renderer + electron tsconfigs
npm run lint
```

Both must pass clean before Phase 7 is considered shipped.
