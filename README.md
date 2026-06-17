# the-great-find

Personal-use, locally-installed price-monitoring & alert app for [olx.bg](https://olx.bg) listings.

Polls saved searches every 30 minutes, stores listings + price history in a local SQLite DB, fires OS notifications on every alert match, and optionally sends emails when SMTP is configured. Exposes a live local dashboard with analytics.

> **Status:** v1 in progress. See `docs/` and the implementation plan.

## What it does

- Watches olx.bg for listings matching saved searches you define
- Polls every 30 minutes; stores everything in a local SQLite DB
- Fires OS notifications on every alert match (mandatory); emails are optional when SMTP is configured
- Lives in your system tray — closing the browser does not quit the app
- Renders a live dashboard with analytics (lowest price last 30d, average, trend, recent listings)
- Hot-reloads parser config from a public GitHub URL so olx.bg HTML changes don't require a re-download

## Distribution

Single native binary per OS — Windows, macOS Intel, macOS Apple Silicon, Linux. Download, double-click, run. Per-OS data lives in:

- Windows: `%APPDATA%\the-great-find\`
- macOS: `~/Library/Application Support/the-great-find/`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/the-great-find/`

## Development

### Prerequisites

| Tool                                      | Minimum version | Install                                                   |
| ----------------------------------------- | --------------- | --------------------------------------------------------- |
| Go                                        | 1.22            | https://go.dev/dl/                                        |
| Node.js                                   | 20 LTS          | https://nodejs.org                                        |
| [sqlc](https://sqlc.dev)                  | latest          | `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`     |
| [goose](https://pressly.github.io/goose/) | latest          | `go install github.com/pressly/goose/v3/cmd/goose@latest` |

### First-time setup

```bash
# 1. Clone
git clone https://github.com/Hari-Hristov/the-great-find.git
cd the-great-find

# 2. Create and migrate the dev database
cd backend
make db-up          # runs migrations against backend/dev.db

# 3. Install frontend deps
cd ../frontend
npm install
```

### Running

```bash
# Terminal 1 — Go backend (serves :8088)
cd backend
go run ./cmd/the-great-find

# Terminal 2 — Vite dev server (serves :5173, proxies /api/* to :8088)
cd frontend
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` and `/events/*` to the Go backend. Production build embeds the React `dist/` into the Go binary via `embed.FS`.

### Other useful commands

```bash
# Run all backend tests
cd backend && make test

# Reset the dev database from scratch
cd backend && make db-reset

# Regenerate sqlc query code after editing queries/
cd backend && make sqlc

# Regenerate frontend API types from the OpenAPI schema
cd frontend && npm run gen:types
```

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
