#!/usr/bin/env python3
"""Regenerate derived icons (icon.ico, icon.icns, tray-icon*) from
icon-source.png. The source can be the procedural placeholder, the v1
magnifying-glass render, or a real designed PNG — this script doesn't care
about provenance, only that the file exists at 1024x1024.

Usage:
    python3 frontend/build/regen-icons.py
"""

from __future__ import annotations

import struct
import sys
import zlib

# Force UTF-8 stdout so the ✓ / other non-ASCII progress prints don't crash
# on Windows CI runners where sys.stdout defaults to cp1252 (no console
# locale) and blows up with UnicodeEncodeError on the first fancy char.
# reconfigure() exists on TextIOWrapper since Python 3.7; CI is 3.12.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / "icon-source.png"

# ─── Minimal PNG reader ──────────────────────────────────────────────────

def read_png(path: Path) -> tuple[int, int, list[list[tuple[int, int, int, int]]]]:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    pos = 8
    width = height = 0
    bit_depth = color_type = 0
    idat = bytearray()
    while pos < len(raw):
        length = struct.unpack(">I", raw[pos : pos + 4])[0]
        tag = raw[pos + 4 : pos + 8]
        data = raw[pos + 8 : pos + 8 + length]
        pos += 12 + length  # skip CRC

        if tag == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(">IIBBBBB", data)
        elif tag == b"IDAT":
            idat += data
        elif tag == b"IEND":
            break

    if bit_depth != 8 or color_type != 6:
        raise ValueError(f"{path}: only 8-bit RGBA PNGs supported (depth={bit_depth}, type={color_type})")

    decompressed = zlib.decompress(bytes(idat))
    pixels: list[list[tuple[int, int, int, int]]] = []
    stride = width * 4
    prev_row = bytes(stride)
    rp = 0
    for _y in range(height):
        filt = decompressed[rp]
        rp += 1
        row = bytearray(decompressed[rp : rp + stride])
        rp += stride

        if filt == 0:  # None
            pass
        elif filt == 1:  # Sub
            for i in range(4, stride):
                row[i] = (row[i] + row[i - 4]) & 0xFF
        elif filt == 2:  # Up
            for i in range(stride):
                row[i] = (row[i] + prev_row[i]) & 0xFF
        elif filt == 3:  # Average
            for i in range(stride):
                left = row[i - 4] if i >= 4 else 0
                up = prev_row[i]
                row[i] = (row[i] + (left + up) // 2) & 0xFF
        elif filt == 4:  # Paeth
            for i in range(stride):
                left = row[i - 4] if i >= 4 else 0
                up = prev_row[i]
                up_left = prev_row[i - 4] if i >= 4 else 0
                p = left + up - up_left
                pa = abs(p - left)
                pb = abs(p - up)
                pc = abs(p - up_left)
                if pa <= pb and pa <= pc:
                    pred = left
                elif pb <= pc:
                    pred = up
                else:
                    pred = up_left
                row[i] = (row[i] + pred) & 0xFF
        else:
            raise ValueError(f"unsupported PNG filter: {filt}")

        prev_row = bytes(row)
        out_row = [
            (row[i], row[i + 1], row[i + 2], row[i + 3])
            for i in range(0, stride, 4)
        ]
        pixels.append(out_row)

    return width, height, pixels

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

# ─── Resampling — box filter, fast enough at <2K ─────────────────────────

def resize(pixels, target_size):
    sh = len(pixels)
    sw = len(pixels[0])
    out: list[list[tuple[int, int, int, int]]] = []
    for y in range(target_size):
        row: list[tuple[int, int, int, int]] = []
        sy0 = int(y * sh / target_size)
        sy1 = max(sy0 + 1, int((y + 1) * sh / target_size))
        for x in range(target_size):
            sx0 = int(x * sw / target_size)
            sx1 = max(sx0 + 1, int((x + 1) * sw / target_size))
            r = g = b = a = 0
            n = 0
            for yy in range(sy0, min(sy1, sh)):
                for xx in range(sx0, min(sx1, sw)):
                    pr, pg, pb, pa = pixels[yy][xx]
                    r += pr
                    g += pg
                    b += pb
                    a += pa
                    n += 1
            n = max(n, 1)
            row.append((r // n, g // n, b // n, a // n))
        out.append(row)
    return out

# ─── ICO / ICNS minimal containers ───────────────────────────────────────

def write_ico_from_png(path: Path, png_path: Path, size: int) -> None:
    png_bytes = png_path.read_bytes()
    icondir = struct.pack("<HHH", 0, 1, 1)
    iconentry = struct.pack(
        "<BBBBHHII",
        size if size < 256 else 0,
        size if size < 256 else 0,
        0, 0, 1, 32, len(png_bytes), 22,
    )
    path.write_bytes(icondir + iconentry + png_bytes)

def write_icns_from_png(path: Path, png_path: Path) -> None:
    png_bytes = png_path.read_bytes()
    type_tag = b"ic08"
    type_chunk = type_tag + struct.pack(">I", len(png_bytes) + 8) + png_bytes
    header = b"icns" + struct.pack(">I", len(type_chunk) + 8)
    path.write_bytes(header + type_chunk)

# ─── Tray template (alpha-only) ──────────────────────────────────────────

def to_alpha_only(pixels):
    """Convert a colour PNG to a macOS template image (black + alpha)."""
    out = []
    for row in pixels:
        out.append([(0, 0, 0, p[3]) for p in row])
    return out

# ─── Entry point ─────────────────────────────────────────────────────────

def main() -> int:
    if not SOURCE.exists():
        print(f"error: {SOURCE} missing — run render-icon-v1.py or supply a real design first")
        return 1

    w, h, pixels = read_png(SOURCE)
    if w != h:
        print(f"warning: source is {w}x{h}, expected a square. proceeding.")
    print(f"loaded source: {w}x{h}")

    # 512x512 — Linux AppImage
    icon_png = resize(pixels, 512)
    write_png(ROOT / "icon.png", icon_png)
    print(f"  ✓ icon.png (512x512)")

    # 32x32 — Windows/Linux tray
    tray_png = resize(pixels, 32)
    write_png(ROOT / "tray-icon.png", tray_png)
    print(f"  ✓ tray-icon.png (32x32)")

    # 44x44 alpha-only — macOS tray template
    tray_44 = resize(pixels, 44)
    write_png(ROOT / "tray-icon-Template@2x.png", to_alpha_only(tray_44))
    print(f"  ✓ tray-icon-Template@2x.png (44x44, alpha mask)")

    # 256x256 PNG payload for ICO + ICNS
    icon_256 = resize(pixels, 256)
    payload = ROOT / "_icon-256.png"
    write_png(payload, icon_256)

    write_ico_from_png(ROOT / "icon.ico", payload, 256)
    print(f"  ✓ icon.ico (256x256 PNG-in-ICO)")

    write_icns_from_png(ROOT / "icon.icns", payload)
    print(f"  ✓ icon.icns (256x256)")

    payload.unlink()
    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
