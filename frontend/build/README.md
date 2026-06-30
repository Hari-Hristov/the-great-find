# App Icons

This directory holds the assets that `electron-builder` and the tray code
consume.

## Current state — v1 (magnifying-glass)

A pure-Python rendered magnifying-glass icon ships in v1. It is intentionally
quiet — no inner gradients (per `PRODUCT.md` anti-refs), warm amber accent
matching the dashboard. Better than a flat-colour placeholder, still meant
to be replaced by a real designed asset when one exists.

## Files

| File | Used by | Notes |
|---|---|---|
| `icon-source.png` | source for derived icons | 1024×1024, the only file a designer needs to replace |
| `icon.png` | Linux AppImage | 512×512 |
| `icon.ico` | Windows NSIS installer + window | 256×256 PNG-in-ICO |
| `icon.icns` | macOS `.dmg` + window | 256×256 |
| `tray-icon.png` | Tray on Windows / Linux | full-colour, 32×32 |
| `tray-icon-Template@2x.png` | Tray on macOS | alpha mask, 44×44 (22pt @2x) |

## Workflow

### Refresh the v1 magnifying-glass

```bash
python3 frontend/build/render-icon-v1.py     # writes icon-source.png + icon.png
python3 frontend/build/regen-icons.py        # writes derived .ico/.icns/tray
```

### Drop in a real designed icon

1. Replace `icon-source.png` with a real 1024×1024 design.
2. Run `python3 frontend/build/regen-icons.py` to refresh every derived
   asset from the new source. The script does box-filter downsampling and
   builds valid (minimal) ICO + ICNS containers around 256×256 PNG payloads.

### CI integration

The release workflow (`.github/workflows/release.yml`) regenerates icons via
`make-placeholders.py` when no committed source is found. Once a real
`icon-source.png` is in the repo, CI uses it directly.

## Why we don't use electron-icon-builder

We previously documented `npx electron-icon-builder` as the recipe. We don't
ship it any more because:

- The pure-Python tools we now use have zero npm dependencies, run identically
  in CI on every platform, and produce valid ICO/ICNS files.
- A real future revamp can swap the renderer for whatever — Figma export +
  ImageMagick, an SVG run through `inkscape --export-type=png`, anything.
  The contract is: a 1024×1024 PNG at `icon-source.png`, and `regen-icons.py`
  produces the rest.
