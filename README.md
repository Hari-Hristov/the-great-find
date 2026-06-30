# The Great Find

A quiet pair of eyes on [olx.bg](https://olx.bg). Runs locally on your machine, tucks itself into the system tray, and tells you the moment a listing you care about appears or drops below your target price.

No cloud. No account. No telemetry. The database is a SQLite file on your disk and the network only talks to olx.bg.

![Screenshot of the dashboard](docs/screenshots/dashboard-overview.png)

---

## Install

The app is unsigned in v1 — see [`INSTALL-NOTES.md`](./INSTALL-NOTES.md) for the one-time bypass step per OS.

Grab the latest release for your platform from the
[Releases page](https://github.com/Hari-Hristov/the-great-find/releases):

| OS | Artifact | Notes |
|---|---|---|
| Windows | `The-Great-Find-Setup-X.Y.Z.exe` | NSIS installer. SmartScreen warning is normal — click **More info → Run anyway**. |
| macOS | `The-Great-Find-X.Y.Z-universal.dmg` | Universal (Apple Silicon + Intel). First launch: right-click the app → **Open**. |
| Linux | `The-Great-Find-X.Y.Z-x86_64.AppImage` | `chmod +x` and run. Tray support depends on your DE. |

## First run

On first launch you get a 4-step setup wizard:

1. **Welcome** — a short intro to what the app does.
2. **Data directory** — confirm or override where the SQLite database lives. Defaults to the OS-conventional path (see below).
3. **Notifications** — choose whether OS notifications fire on alerts. SMTP setup for email alerts is deferred to the Settings panel; skipping it is fine.
4. **First search** — name it, point it at an olx.bg category, set a target price if you want one. You can add more, edit, and tune later from the Searches window.

After the wizard, the app drops into the tray. Single-click the tray icon (or double-click on Windows) to bring the dashboard up; right-click for **Open** / **Quit**. Closing the window only hides it — the polling keeps running.

## How it works

- Each saved search polls on its own schedule (default 30 minutes).
- Every observation is stored in the local SQLite database — listings, photos, params, and a full price-history table.
- Alerts fire on **new match**, **keyword**, **price drop**, or **price below target**. Each fires an OS notification + (optionally) an email + a live row in the dashboard feed.
- Currency normalises to EUR (Bulgaria adopted the euro on 2026-01-01; BGN conversions use the official 1.95583 peg).
- The dashboard surfaces analytics per search: 30-day average, min/max, trend chart, lowest-priced recent listings, days-on-market estimates.

## Configuration

### Data directory

The SQLite database lives in the OS-conventional app data folder by default:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\the-great-find\` |
| macOS | `~/Library/Application Support/the-great-find/` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/the-great-find/` |

Override it from the first-run wizard, or edit `<userData>/config.json`. Changes apply on next launch — existing data stays in place at the old location.

### Environment overrides

| Var | Effect |
|---|---|
| `THE_GREAT_FIND_DATA_DIR` | Force a specific data directory regardless of OS conventions or wizard choice. |
| `BACKEND_PORT` | Pin the backend HTTP port. Empty / `0` (the packaged default) lets the OS pick one. `8088` is the local dev convention. |

### SMTP / email alerts

Open Settings inside the dashboard → **Email** to wire up SMTP. The app mirrors every fired alert to the configured recipient. Plain SMTP, STARTTLS, and TLS are all supported; SMTP auth is optional. Test connectivity from the same screen before saving.

### Tray behaviour

- **Single click** (Windows / Linux) or click on the menu-bar icon (macOS): toggles the dashboard window.
- **Double click** (Windows): same as single click. Some Windows setups only fire double-click.
- **Right click**: context menu → **Open** / **Quit**.

The app is configured as a menu-bar utility on macOS (`LSUIElement=true`) — there is no Dock icon by design.

## Build from source

```bash
git clone https://github.com/Hari-Hristov/the-great-find.git
cd the-great-find
```

**All Go commands must run in WSL2 on Windows** — corporate WDAC policy on the development laptop blocks Go binaries compiled from the native Windows shell. The detailed working-around lives in [`CLAUDE.md`](./CLAUDE.md). On macOS / Linux there is no equivalent restriction.

### Quick build (host OS only)

```bash
bash scripts/build.sh
```

Produces `dist/bin/<goos>-<goarch>/the-great-find[.exe]` and a packaged Electron app under `dist/electron/`.

### Cross-build (all four targets)

```bash
bash scripts/cross-build.sh
```

Produces Go binaries for `windows/amd64`, `darwin/amd64`, `darwin/arm64`, and `linux/amd64`. Pure-Go SQLite (`modernc/sqlite`) means no CGO and no cross-toolchain setup needed.

### Dev loop

See [`frontend/electron/README.md`](./frontend/electron/README.md) for the three dev modes (browser-only, Electron dev, packaged smoke).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron main process                                           │
│  ─────────────────────                                           │
│   • spawns Go sidecar as child process (BACKEND_PORT=0)          │
│   • parses bound port from sidecar stdout                        │
│   • tray icon + single-instance lock + hide-to-tray              │
│   • IPC bridge → window.tgf in renderer                          │
└─────────────────┬────────────────────────────────────────────────┘
                  │ HTTP /api  +  SSE /events
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Go backend (the-great-find)                                     │
│  ───────────────────────────                                     │
│   • chi router + huma v2 typed handlers under /api/              │
│   • scheduler — one polling goroutine per active saved search    │
│   • alerts/ — new_match / keyword / price_drop / price_below     │
│   • politehttp — HostGate shared across scraper + JSON API path  │
│   • db/store — SQLite via modernc/sqlite (pure Go, no CGO)       │
│   • notify — OS toasts + optional SMTP fan-out                   │
└──────────────────────────────────────────────────────────────────┘
```

The dashboard is a TanStack Router + React app. The Electron renderer loads it directly; in dev mode you can also run it in a regular browser against the same Go backend.

## Roadmap

- [#46 — Auto-discover OLX filter params](https://github.com/Hari-Hristov/the-great-find/issues/46) (parked)
- Browse open issues: <https://github.com/Hari-Hristov/the-great-find/issues>

## ⚠️ Important — Personal Use Only

**This tool is for personal, non-commercial use only.** Do NOT use it to:

- Resell scraped data
- Build a competing classifieds product
- Aggregate listings into a third-party service
- Operate at request rates that could disrupt olx.bg

### Gray area: the internal JSON API

Starting from v1, this app does **not** parse olx.bg's HTML by default. It calls
`https://www.olx.bg/api/v1/offers/`, which is the same internal JSON endpoint
the olx.bg website itself uses to render search results.

This API is **undocumented and undeclared.** It is not part of any official
public OLX product, has no SLA, no published terms, and may change or
disappear at any time. Calling it sits in a legal/ethical gray area:

- **Mechanically**, this is closer to using a public API than to scraping HTML.
- **Officially**, OLX has not declared this endpoint open for third-party
  consumption, and their general Terms of Service likely prohibit programmatic
  access without a partner agreement.

By using this tool, you accept that:

1. **You are solely responsible** for how you use it. The author provides no
   warranty and accepts no liability.
2. **It is for personal use only** — monitoring listings for yourself, not for
   any commercial purpose.
3. **The polite-bot defaults** (one in-flight request per host, ~1.5s spacing
   with jitter, conservative pagination caps) are a courtesy, not a license.
   Do not raise them.
4. **If you intend to commercialize** anything that touches olx.bg listings,
   you must contact OLX BG (https://www.olx.bg/help) for a partner agreement
   and use their officially-supported channels — not this tool.

If OLX BG asks for this project to stop calling their API, the maintainer will
comply immediately. **Use at your own risk.**

The HTML scraper path (used in earlier versions) is still in the binary as a
fallback. Removing the `api` block from `parser-config/olx-bg.json` and
restarting the app reverts to HTML grid scraping.

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE).

In short: you can download, run, modify, and share this app freely for any
**noncommercial** purpose — personal use, hobby projects, study, research,
or use by nonprofits / educational / government institutions.

You may **not** use it commercially. That includes selling it, bundling it
into a paid product, running it as a paid service, or any other use with an
anticipated commercial application. See the LICENSE file for the full terms
and definitions.
