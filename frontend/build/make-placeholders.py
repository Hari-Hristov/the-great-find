#!/usr/bin/env python3
"""Generate placeholder app icons so the electron-builder pipeline can run
before the real designs land (Phase 10.3 polish).

These are deliberately ugly — flat colour with a centered glyph — to make it
obvious they are not the final art. Once real assets exist under
frontend/build/icon-source.png the recipe in this directory's README.md takes
over and this script is no longer needed.

Usage:
    python3 frontend/build/make-placeholders.py

Outputs:
    frontend/build/icon-source.png        (1024x1024)
    frontend/build/icon.png               (512x512)
    frontend/build/tray-icon.png          (32x32)
    frontend/build/tray-icon-Template@2x.png  (44x44, alpha mask)
    frontend/build/icon.ico               (256x256, single-frame ICO)
    frontend/build/icon.icns              (256x256, single-frame ICNS)

Only the stdlib is used so this works on any vaguely modern Python.
"""

from __future__ import annotations

import struct
import zlib
import sys
from pathlib import Path

ROOT = Path(__file__).parent

# Brand-adjacent colour: deep base + bright accent. Anti-grey, anti-default.
BG = (10, 10, 12, 255)          # near-black background
FG = (255, 209, 102, 255)       # warm amber — placeholder, not final

# ─── PNG writer (no external deps) ───────────────────────────────────────

def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )

def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    h = len(pixels)
    w = len(pixels[0])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter: None
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    idat = zlib.compress(bytes(raw), 9)
    path.write_bytes(
        sig + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", idat) + _png_chunk(b"IEND", b"")
    )

# ─── Drawing helpers ─────────────────────────────────────────────────────

def make_icon_pixels(size: int, glyph: str = "+", alpha_only: bool = False) -> list[list[tuple[int, int, int, int]]]:
    """Solid background, big centered glyph drawn as a chunky pixel pattern."""
    grid = [[BG] * size for _ in range(size)]

    # Draw a big chunky "+" glyph by filling two perpendicular bars.
    bar = max(2, size // 6)
    margin = size // 4
    mid = size // 2

    if glyph == "+":
        # horizontal bar
        for y in range(mid - bar // 2, mid + bar // 2):
            for x in range(margin, size - margin):
                grid[y][x] = FG
        # vertical bar
        for y in range(margin, size - margin):
            for x in range(mid - bar // 2, mid + bar // 2):
                grid[y][x] = FG

    if alpha_only:
        # macOS template images: alpha controls visibility, RGB is ignored.
        # Convert to pure-alpha black where FG was opaque.
        return [
            [(0, 0, 0, 255) if pix == FG else (0, 0, 0, 0) for pix in row]
            for row in grid
        ]

    return grid

# ─── ICO and ICNS minimal containers ─────────────────────────────────────

def write_ico_from_png(path: Path, png_path: Path, size: int) -> None:
    """Write a 1-image .ico that embeds a PNG payload. Modern Windows
    supports PNG-in-ICO since Vista, so this is the simplest valid format."""
    png_bytes = png_path.read_bytes()
    # ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG payload
    icondir = struct.pack("<HHH", 0, 1, 1)
    iconentry = struct.pack(
        "<BBBBHHII",
        size if size < 256 else 0,
        size if size < 256 else 0,
        0, 0, 1, 32, len(png_bytes), 22,
    )
    path.write_bytes(icondir + iconentry + png_bytes)

def write_icns_from_png(path: Path, png_path: Path) -> None:
    """Write a minimal .icns that embeds a 256x256 PNG as the `ic08` type.
    macOS reads this happily; sufficient for placeholder builds."""
    png_bytes = png_path.read_bytes()
    type_tag = b"ic08"  # 256x256
    type_chunk = type_tag + struct.pack(">I", len(png_bytes) + 8) + png_bytes
    header = b"icns" + struct.pack(">I", len(type_chunk) + 8)
    path.write_bytes(header + type_chunk)

# ─── Entry point ─────────────────────────────────────────────────────────

def main() -> int:
    icon_src = ROOT / "icon-source.png"
    if icon_src.exists():
        # Respect the committed source — production CI/dev environments use
        # render-icon-v1.py or a real designed asset. This script is only a
        # last-resort fallback for environments that need *something* on disk.
        print(f"icon-source.png already present at {icon_src} — skipping placeholder generation")
        print("(run regen-icons.py to rebuild derived icons from the existing source)")
        return 0

    print(f"no icon-source.png found — writing flat-colour placeholders to {ROOT}")

    write_png(icon_src, make_icon_pixels(1024))
    print(f"  ✓ {icon_src.name} (1024x1024)")

    icon_png = ROOT / "icon.png"
    write_png(icon_png, make_icon_pixels(512))
    print(f"  ✓ {icon_png.name} (512x512)")

    tray_png = ROOT / "tray-icon.png"
    write_png(tray_png, make_icon_pixels(32))
    print(f"  ✓ {tray_png.name} (32x32)")

    tray_template = ROOT / "tray-icon-Template@2x.png"
    write_png(tray_template, make_icon_pixels(44, alpha_only=True))
    print(f"  ✓ {tray_template.name} (44x44 alpha template)")

    # ICO needs a 256x256 PNG payload for best Windows results.
    ico_payload = ROOT / "_icon-256.png"
    write_png(ico_payload, make_icon_pixels(256))
    icon_ico = ROOT / "icon.ico"
    write_ico_from_png(icon_ico, ico_payload, 256)
    print(f"  ✓ {icon_ico.name} (256x256, PNG-in-ICO)")

    icon_icns = ROOT / "icon.icns"
    write_icns_from_png(icon_icns, ico_payload)
    print(f"  ✓ {icon_icns.name} (256x256)")

    ico_payload.unlink()  # cleanup

    print("\nDone. These are placeholders — replace before shipping.")
    print("See frontend/build/README.md for the regeneration recipe.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
