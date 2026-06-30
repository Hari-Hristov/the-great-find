#!/usr/bin/env python3
"""Generate a v1 icon source from a hand-tuned SVG.

The output is *better than the procedural placeholder* but is still meant
as v1 — a quiet magnifying glass with the brand accent. Replace with real
design once it exists.

Usage:
    python3 frontend/build/render-icon-v1.py

This is a pure-stdlib renderer: it composes a 1024x1024 PNG matching the
hand-tuned design below. Used by both `make-placeholders.py` (as a fallback)
and by the CI build to refresh derived icons (icon.ico, icon.icns, etc).
"""

from __future__ import annotations

import math
import struct
import zlib
import sys
from pathlib import Path

ROOT = Path(__file__).parent

SIZE = 1024
BG = (10, 10, 12, 255)          # deep base — matches dashboard --color-bg-base
ACCENT = (255, 209, 102, 255)   # warm amber accent
RING = (240, 240, 245, 255)     # off-white for the glass ring
LENS_TINT = (255, 209, 102, 60) # semi-transparent accent inside the lens

# ─── PNG writer ──────────────────────────────────────────────────────────

def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )

def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    h, w = len(pixels), len(pixels[0])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    idat = zlib.compress(bytes(raw), 9)
    path.write_bytes(sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b""))

# ─── Drawing primitives ──────────────────────────────────────────────────

def blend(dst: tuple[int, int, int, int], src: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Source-over alpha blend, integer."""
    sr, sg, sb, sa = src
    dr, dg, db, da = dst
    if sa == 0:
        return dst
    if sa == 255:
        return src
    alpha = sa / 255.0
    inv = 1.0 - alpha
    return (
        int(sr * alpha + dr * inv),
        int(sg * alpha + dg * inv),
        int(sb * alpha + db * inv),
        max(da, sa),
    )

def render() -> list[list[tuple[int, int, int, int]]]:
    grid = [[BG] * SIZE for _ in range(SIZE)]

    # Magnifying glass geometry:
    #   - lens centered at (0.42, 0.42) of the canvas
    #   - lens outer radius ~0.30, ring stroke width 0.04
    #   - handle extending toward lower-right corner
    cx, cy = SIZE * 0.42, SIZE * 0.42
    r_outer = SIZE * 0.30
    r_inner = r_outer - SIZE * 0.05  # ring thickness
    r_glass = r_inner - SIZE * 0.015  # tiny gap for visual breathing room

    handle_angle = math.radians(45.0)
    handle_start = r_outer - SIZE * 0.005
    handle_end = SIZE * 0.62
    handle_width = SIZE * 0.055

    sx = cx + math.cos(handle_angle) * handle_start
    sy = cy + math.sin(handle_angle) * handle_start
    ex = cx + math.cos(handle_angle) * handle_end
    ey = cy + math.sin(handle_angle) * handle_end

    # antialiased rasterizer — distance to shape, soft alpha within 1px
    def aa(d: float) -> int:
        # d < 0 inside, > 0 outside. Smooth 1.5-px transition.
        if d <= -0.75:
            return 255
        if d >= 0.75:
            return 0
        return max(0, min(255, int(255 * (0.5 - d / 1.5))))

    for y in range(SIZE):
        for x in range(SIZE):
            # Distances
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)

            # 1. Lens fill (tinted)
            if r < r_glass + 1:
                a = aa(r - r_glass)
                if a > 0:
                    tint = (LENS_TINT[0], LENS_TINT[1], LENS_TINT[2], int(LENS_TINT[3] * a / 255))
                    grid[y][x] = blend(grid[y][x], tint)

            # 2. Lens ring
            if r_inner - 1 < r < r_outer + 1:
                a_outer = aa(r - r_outer)
                a_inner = aa(r_inner - r)
                a = min(a_outer, a_inner)
                if a > 0:
                    grid[y][x] = blend(grid[y][x], (RING[0], RING[1], RING[2], a))

            # 3. Handle — segment from (sx,sy) to (ex,ey) with rounded width
            #    Compute perpendicular distance to the segment
            vx, vy = ex - sx, ey - sy
            seg_len_sq = vx * vx + vy * vy
            if seg_len_sq > 0:
                t = ((x - sx) * vx + (y - sy) * vy) / seg_len_sq
                t = max(0.0, min(1.0, t))
                px = sx + t * vx
                py = sy + t * vy
                dh = math.hypot(x - px, y - py)
                a = aa(dh - handle_width / 2)
                if a > 0:
                    grid[y][x] = blend(grid[y][x], (ACCENT[0], ACCENT[1], ACCENT[2], a))

            # 4. Tiny accent highlight inside the lens (upper-left curve)
            hx, hy = cx - r_glass * 0.45, cy - r_glass * 0.45
            hr = math.hypot(x - hx, y - hy)
            if hr < SIZE * 0.06:
                a = aa(hr - SIZE * 0.05)
                if a > 0:
                    grid[y][x] = blend(
                        grid[y][x], (255, 255, 255, int(a * 0.18))
                    )

    return grid


def main() -> int:
    print(f"rendering v1 icon to {ROOT / 'icon-source.png'}")
    grid = render()
    write_png(ROOT / "icon-source.png", grid)
    # 512x512 downsample for AppImage (cheap nearest-neighbour — good enough)
    print("rendering 512x512 icon.png")
    step = SIZE // 512
    small = [grid[y * step][::step] for y in range(512)]
    write_png(ROOT / "icon.png", small)
    print("done. run electron-icon-builder to refresh icon.ico / icon.icns.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
