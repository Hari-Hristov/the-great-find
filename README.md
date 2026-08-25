# The Great Find

A quiet pair of eyes on [olx.bg](https://olx.bg). Runs locally on your machine, tucks itself into the system tray, and tells you the moment a listing you care about appears or drops below your target price.

No cloud. No account. No telemetry. The database is a SQLite file on your disk and the network only talks to olx.bg.

### Features

- **Saved searches** — monitor multiple olx.bg categories or queries with independent poll schedules
- **Price monitoring** — price-history tracking for every observed listing, recorded whenever the price changes
- **Alerts** — new match, keyword match, price drop, or price below target; delivered via OS notifications and optional email. Note: only **price below target** is creatable from the UI today — the other three rules are implemented in the engine but need `alert_criteria` written directly
- **Flagged items** — hide listings you're not interested in, so they're excluded from results and never alert you again
- **Analytics** — per-search min/max/average price, trend chart, days-on-market, and weekly absorption rate
- **Theming** — two themes, **Default** (dark blue) and **Military** (phosphor-green terminal), switchable from Settings


---

## Download

The app is unsigned in v1 — see [`INSTALL-NOTES.md`](./INSTALL-NOTES.md) for the one-time bypass step per OS.

Grab the latest release (or pre-release, if you want an early build) for your platform from the
[Releases page](https://github.com/Hari-Hristov/the-great-find/releases):

| OS | Artifact | Notes |
|---|---|---|
| Windows | `The-Great-Find-X.Y.Z-windows-x64.exe` | SmartScreen warning is normal — click **More info → Run anyway**. |
| macOS | `The-Great-Find-X.Y.Z-macos-universal.dmg` | Universal (Apple Silicon + Intel). First launch: right-click the app → **Open**. |
| Linux | `The-Great-Find-X.Y.Z-linux-x64.AppImage` | `chmod +x` and run. Tray support depends on your DE. |

## Run locally

```bash
git clone https://github.com/Hari-Hristov/the-great-find.git
cd the-great-find
bash scripts/build.sh
```

Requires **Go 1.26+** and **Node.js 20+**. Produces a Go binary under `dist/bin/` and a packaged Electron app under `dist/electron/`. See [`frontend/electron/README.md`](./frontend/electron/README.md) for the full dev loop (browser-only, Electron dev, packaged smoke test).

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

### Why outbound olx.bg requests go through Electron

Both ingestion paths (the JSON API client and the HTML scraper fallback) send their `GET` requests through Electron's own Chromium network stack instead of Go's `net/http`, via a token-authenticated loopback proxy Electron serves and Go calls (`backend/internal/fetchproxy` ↔ `frontend/electron/fetchproxy.ts`). olx.bg's CDN blocks Go's `net/http` on TLS/HTTP2 fingerprint alone, independent of headers — Electron is already resident in the tray, so this uses a real browser engine the app already ships rather than spoofing one. The honest User-Agent (see below) is preserved end to end, the HostGate politeness budget is untouched, and there's no proxy rotation, header randomization, or TLS-library patching involved.

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

**Note (v1.0.0+):** olx.bg's CDN blocks this endpoint by TLS/HTTP2 fingerprint
when called from Go's own HTTP client, independent of headers. As of this
release, requests are routed through Electron's own Chromium network stack
instead — the same browser engine the app already ships in its tray process —
rather than spoofing a user agent or fingerprint from Go. This doesn't change
the honest User-Agent, the request rate, or the politeness budget described
below; it only changes which network stack initiates the request. See
[Architecture](#architecture) for the technical details.

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
