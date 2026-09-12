"""Generate AgentHub icon assets from the source JPEG.

Outputs (absolute Windows paths):
- public/icons/agenthub.svg            -> canonical SVG mark (re-vectorized by hand, see public/icons/agenthub.svg)
- public/icons/agenthub-512.png        -> 512x512 PNG (used for favicon SVG raster fallback)
- public/icons/agenthub-256.png        -> 256x256 PNG
- public/icons/agenthub-192.png        -> 192x192 PNG (PWA)
- public/icons/agenthub-180.png        -> 180x180 PNG (Apple touch)
- public/icons/favicon-32.png          -> 32x32 PNG (favicon modern)
- public/icons/favicon-16.png          -> 16x16 PNG (favicon classic)
- public/icons/apple-touch-icon.png    -> 180x180 PNG alias (Apple touch icon)
- public/icons/icon.png                -> 512x512 PNG (Electron window icon & electron-builder fallback)
- electron/build/icon.png              -> 1024x1024 PNG (electron-builder macOS retina source)
- electron/build/icon.ico              -> multi-size .ico (Windows)
- electron/build/icon.icns             -> multi-size .icns (macOS, generated via PNG concatenation since icnsutil is not always present)

Notes on ICO: Windows accepts multi-size .ico with embedded PNG frames (Vista+).
Notes on Windows ICO embed: built by Pillow via ICO format with multiple sizes.
"""

from __future__ import annotations

import os
import shutil
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\he\Documents\bitdance-agenthub")
SRC = Path(r"C:\Users\he\.workbuddy\clipboard-images\clipboard-2026-09-12T11-35-12-066Z-94148527.jpg")

PUBLIC_ICONS = ROOT / "public" / "icons"
BUILD_DIR = ROOT / "electron" / "build"

PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)
BUILD_DIR.mkdir(parents=True, exist_ok=True)


def _load_square(size: int) -> Image.Image:
    im = Image.open(SRC).convert("RGBA")
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return im


def _save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".png":
        im.save(path, format="PNG", optimize=True)
    else:
        im.save(path)


def write_png(size: int, dest: Path) -> None:
    im = _load_square(size)
    _save(im, dest)
    print(f"png -> {dest} ({size}x{size})")


def write_favicon_ico(sizes: list[int], dest: Path) -> None:
    base = _load_square(max(sizes))
    frames = [base.resize((s, s), Image.LANCZOS) for s in sizes]
    base.resize((max(sizes), max(sizes)), Image.LANCZOS).save(
        dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:]
    )
    print(f"ico -> {dest} ({sizes})")


def write_icns(sizes: list[int], dest: Path) -> None:
    """Generate a minimal ICNS file from PNG frames.

    ICNS layout: 'icns' magic, total file size (big endian uint32), then chunks
    'ic07'(128), 'ic08'(256), 'ic09'(512), 'ic10'(1024), 'ic11'(32), etc.
    Each chunk: 4-byte type, 4-byte big-endian size (incl. header), then data.
    """
    TYPE_FOR_SIZE = {
        16: b"icp4",
        32: b"icp5",
        64: b"icp6",
        128: b"ic07",
        256: b"ic08",
        512: b"ic09",
        1024: b"ic10",
    }
    chunks = []
    for s in sizes:
        if s not in TYPE_FOR_SIZE:
            print(f"skip size {s} (no icns type)")
            continue
        png = _load_square(s)
        from io import BytesIO

        buf = BytesIO()
        png.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        typ = TYPE_FOR_SIZE[s]
        size = 8 + len(data)
        chunks.append(typ + struct.pack(">I", size) + data)

    body = b"".join(chunks)
    total = 8 + len(body)
    with open(dest, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total) + body)
    print(f"icns -> {dest} ({sizes})")


def main() -> int:
    # public/icons - the web-side set
    write_png(512, PUBLIC_ICONS / "agenthub-512.png")
    write_png(256, PUBLIC_ICONS / "agenthub-256.png")
    write_png(192, PUBLIC_ICONS / "agenthub-192.png")
    write_png(180, PUBLIC_ICONS / "agenthub-180.png")
    write_png(32, PUBLIC_ICONS / "favicon-32.png")
    write_png(16, PUBLIC_ICONS / "favicon-16.png")

    # Apple touch icon alias at the well-known path
    shutil.copy2(PUBLIC_ICONS / "agenthub-180.png", PUBLIC_ICONS / "apple-touch-icon.png")
    print(f"alias -> {PUBLIC_ICONS / 'apple-touch-icon.png'}")

    # electron/build - electron-builder source
    write_png(1024, BUILD_DIR / "icon.png")
    write_png(512, BUILD_DIR / "icon-512.png")
    write_png(256, BUILD_DIR / "icon-256.png")
    write_png(128, BUILD_DIR / "icon-128.png")
    write_png(64, BUILD_DIR / "icon-64.png")
    write_png(48, BUILD_DIR / "icon-48.png")
    write_png(32, BUILD_DIR / "icon-32.png")
    write_png(16, BUILD_DIR / "icon-16.png")
    # The conventional electron-builder filename at electron/build/icon.png (we just made 1024)
    # and a Windows ICO at electron/build/icon.ico
    write_favicon_ico([16, 24, 32, 48, 64, 128, 256], BUILD_DIR / "icon.ico")
    write_icns([16, 32, 64, 128, 256, 512, 1024], BUILD_DIR / "icon.icns")

    # Also drop a copy at the well-known public/icons/icon.png (handy for desktop window.setIcon)
    shutil.copy2(BUILD_DIR / "icon-256.png", PUBLIC_ICONS / "icon.png")
    print(f"alias -> {PUBLIC_ICONS / 'icon.png'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())