"""Rebuild Windows .ico and macOS .icns from the compact mark PNGs."""

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\he\Documents\bitdance-agenthub")
ICONS = ROOT / "public" / "icons"
BUILD = ROOT / "electron" / "build"


def _load(size: int) -> Image.Image:
    p = ICONS / f"agenthub-mark-{size}.png"
    return Image.open(p).convert("RGBA")


def write_ico(sizes: list[int], dest: Path) -> None:
    frames = [_load(s).resize((s, s), Image.LANCZOS) for s in sizes]
    max_frame = max(sizes)
    base = _load(max_frame).resize((max_frame, max_frame), Image.LANCZOS)
    base.save(dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:])
    print(f"ico -> {dest} ({sizes})")


def write_icns(sizes: list[int], dest: Path) -> None:
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
            print(f"skip size {s}")
            continue
        png = _load(s)
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


if __name__ == "__main__":
    BUILD.mkdir(parents=True, exist_ok=True)
    write_ico([16, 32, 48, 64, 128, 256], BUILD / "icon.ico")
    write_icns([16, 32, 64, 128, 256, 512], BUILD / "icon.icns")