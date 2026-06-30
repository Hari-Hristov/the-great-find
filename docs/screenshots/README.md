# Screenshots

Captures referenced from the root `README.md`. All shots are taken from the dashboard's dark theme, the cinematic landing's default state, or the tray menu.

| File | What | Source route / context |
|---|---|---|
| `dashboard-overview.png` | The Overview window with a few searches, recent alerts, and the trend strip | `/dashboard` |
| `landing-cinematic.png` | The cinematic landing — console stage, first hero frame | `/` |
| `alert-feed.png` | Close-up of the alert feed, showing a few rows with the new listing-price-on-alert rendering | `/dashboard` (alerts panel) |
| `tray-menu.png` | The system tray right-click context menu (Open / Quit) | OS chrome — not a route |

Capture instructions:

1. **Dashboard / landing**: maximize the Electron window, take a screenshot with the OS native tool (`Win + Shift + S` on Windows, `Cmd + Shift + 4` on macOS).
2. **Tray menu**: right-click the tray icon and capture immediately. On macOS use `Cmd + Shift + 4` then `Space` to capture the menu as a window.
3. Save as PNG. Keep size under ~1 MB each — large PNGs slow GitHub's README rendering.
4. Light theme captures can land in a `light/` subfolder later if we want to show theme support.

> These files are placeholders until real captures are produced as part of Phase 10 polish.
