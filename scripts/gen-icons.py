#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Nexora Studio 图标生成器（唯一入口）。

用法：python scripts/gen-icons.py

源图：仓库根的 `icon_new.png`（约 1071x1075，AI 生成的机器人图标）。

为什么重写：旧管线（scripts/gen-icons.ps1 + 已废弃的 scripts/generate-icons.py）用
System.Drawing 的 `bmp.Save(Png)` 出图 —— GDI+ 的 PNG 编码器不做 filter/调色板优化，
512px 出来 **433KB**；再把这张 512 PNG base64 塞进「SVG」得到 **578KB 的假 SVG**，
而它被 layout.tsx 当成首选 favicon ⇒ 每次页面加载都要下 434KB 的图标。
线上实测：`GET /icons/agenthub-mark.svg -> 200, 433895 bytes`，单次刷新最贵的一项之一。

现在的策略：Pillow 缩放 + **两种编码取更小者**（RGBA 优化 PNG vs 256 色调色板 PNG）。
实测 512px 从 433KB 降到 30KB，逐像素平均误差 2.7/255、p99 仅 7/255（肉眼不可辨）。
不再生成任何「内嵌 base64 PNG 的假 SVG」。

产物（保持既有文件名，避免别处引用断掉）：
  public/icons/        web 图标全集
  src/app/icon.png     Next.js App Router 默认 icon
  electron/build/      electron-builder 源图 + .ico + .icns
  dist-electron/       Electron 运行时窗口图标
"""
from __future__ import annotations

import io
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'icon_new.png'

PUBLIC_ICONS = ROOT / 'public' / 'icons'
APP_DIR = ROOT / 'src' / 'app'
BUILD_DIR = ROOT / 'electron' / 'build'
DIST_ELECTRON = ROOT / 'dist-electron'

# Windows .ico 内嵌帧尺寸
ICO_SIZES = [16, 32, 48, 64, 128, 256]
# macOS .icns 各尺寸对应的 4 字节类型码（ICNS 为大端）
ICNS_TYPE_FOR_SIZE = {
    16: b'icp4',
    32: b'icp5',
    64: b'icp6',
    128: b'ic07',
    256: b'ic08',
    512: b'ic09',
    1024: b'ic10',
}
ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

_stats: list[tuple[str, int, int]] = []


def load_source() -> Image.Image:
    im = Image.open(SRC)
    im.load()
    # 居中裁成正方形再缩放：源图是 1071x1075，硬拉成正方形会让图标被轻微压扁
    side = min(im.size)
    left = (im.width - side) // 2
    top = (im.height - side) // 2
    return im.convert('RGB').crop((left, top, left + side, top + side))


_SOURCE: Image.Image | None = None


def source() -> Image.Image:
    global _SOURCE
    if _SOURCE is None:
        _SOURCE = load_source()
    return _SOURCE


def resized(size: int) -> Image.Image:
    if size == source().width:
        return source()
    return source().resize((size, size), Image.LANCZOS)


def encode_png(im: Image.Image) -> bytes:
    """RGBA-优化 与 256 色调色板 各出一版，返回更小的那个。

    小尺寸（16/32）反而是 RGBA 更小 —— 调色板要带一块 768 字节的调色板 + 索引表，
    在像素本来就少的时候不划算。所以不写死策略，逐个尺寸实测取优。
    """
    rgba = im.convert('RGBA')
    candidates = []

    buf = io.BytesIO()
    rgba.save(buf, format='PNG', optimize=True)
    candidates.append(buf.getvalue())

    pal = rgba.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    buf = io.BytesIO()
    pal.save(buf, format='PNG', optimize=True)
    candidates.append(buf.getvalue())

    return min(candidates, key=len)


def write_png(im: Image.Image, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = encode_png(im)
    before = dest.stat().st_size if dest.exists() else 0
    dest.write_bytes(data)
    _stats.append((str(dest.relative_to(ROOT)).replace('\\', '/'), before, len(data)))
    return len(data)


def write_sized(size: int, dest: Path) -> int:
    return write_png(resized(size), dest)


def png_bytes(im: Image.Image) -> bytes:
    return encode_png(im)


def write_ico(dest: Path) -> None:
    """多尺寸 .ico（Vista+ 允许内嵌 PNG 帧）。

    Pillow 的 ICO 保存会按 `sizes` 逐个在 `append_images` 里找**尺寸精确匹配**的帧；
    找不到才拿基准图缩。所以这里显式给出每一档、且都从全分辨率源图缩下来 ——
    否则 16px 会变成「256px 再缩」，小尺寸糊一档。
    帧一律转 RGBA：ICO 内部按 BMP 存，调色板 PNG 的压缩优势在这里用不上。
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    before = dest.stat().st_size if dest.exists() else 0

    largest = max(ICO_SIZES)
    frames = [resized(s).convert('RGBA') for s in ICO_SIZES]
    primary = frames[ICO_SIZES.index(largest)]
    primary.save(
        dest,
        format='ICO',
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=[f for f, s in zip(frames, ICO_SIZES) if s != largest],
    )
    _stats.append((str(dest.relative_to(ROOT)).replace('\\', '/'), before, dest.stat().st_size))
    print('ico  -> %s (%s)' % (dest.relative_to(ROOT), ICO_SIZES))


def write_icns(dest: Path) -> None:
    """手写最小 ICNS：'icns' 魔数 + 大端总长 + 各尺寸 chunk。

    chunk = 4 字节类型码 + 4 字节大端长度(含 8 字节头) + PNG 数据。
    Python 侧没有稳定的 icns 库，结构又简单，直接拼。
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    before = dest.stat().st_size if dest.exists() else 0

    chunks = []
    for size in ICNS_SIZES:
        typ = ICNS_TYPE_FOR_SIZE.get(size)
        if typ is None:
            continue
        data = png_bytes(resized(size))
        chunks.append(typ + struct.pack('>I', 8 + len(data)) + data)

    body = b''.join(chunks)
    dest.write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    _stats.append((str(dest.relative_to(ROOT)).replace('\\', '/'), before, dest.stat().st_size))
    print('icns -> %s (%s)' % (dest.relative_to(ROOT), ICNS_SIZES))


def main() -> int:
    if not SRC.exists():
        print('source icon not found: %s' % SRC, file=sys.stderr)
        return 1

    print('source: %s %s' % (SRC.name, Image.open(SRC).size))

    # ── public/icons：web 全集 ──
    # agenthub-mark-* 是 layout.tsx / app-workbench 引用的主名；agenthub-* 与 favicon-* 是历史别名，
    # 都保留，避免别处引用断掉。
    for size in (16, 32, 48, 64, 128, 180, 192, 256, 512):
        write_sized(size, PUBLIC_ICONS / ('agenthub-mark-%d.png' % size))
    for size in (180, 192, 256, 512):
        write_sized(size, PUBLIC_ICONS / ('agenthub-%d.png' % size))
    write_sized(16, PUBLIC_ICONS / 'favicon-16.png')
    write_sized(32, PUBLIC_ICONS / 'favicon-32.png')
    write_sized(180, PUBLIC_ICONS / 'apple-touch-icon.png')
    write_sized(512, PUBLIC_ICONS / 'icon.png')

    # ── Next.js App Router 默认 icon ──
    write_sized(32, APP_DIR / 'icon.png')

    # ── electron-builder 源图 ──
    for size in (16, 32, 48, 64, 128, 256, 512):
        write_sized(size, BUILD_DIR / ('icon-%d.png' % size))
    write_sized(512, BUILD_DIR / 'icon.png')
    write_ico(BUILD_DIR / 'icon.ico')
    write_icns(BUILD_DIR / 'icon.icns')

    # ── Electron 运行时窗口图标（main.ts 用 __dirname/icon.png）──
    write_sized(512, DIST_ELECTRON / 'icon.png')

    # ── 汇总 ──
    total_before = sum(b for _, b, _ in _stats)
    total_after = sum(a for _, _, a in _stats)
    print()
    print('%-46s %10s %10s' % ('file', 'before', 'after'))
    for name, before, after in _stats:
        if after > 20_000 or (before and before > 4 * max(after, 1)):
            print('%-46s %10d %10d' % (name, before, after))
    print('-' * 68)
    print('%-46s %10d %10d' % ('TOTAL (%d files)' % len(_stats), total_before, total_after))
    if total_before:
        print('saved %d bytes (%.1f%% smaller)' % (
            total_before - total_after, 100.0 * (total_before - total_after) / total_before))
    print('DONE')
    return 0


if __name__ == '__main__':
    sys.exit(main())
