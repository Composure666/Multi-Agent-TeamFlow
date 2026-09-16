import { deflateSync, inflateSync } from 'node:zlib'

/**
 * 无依赖 PNG 裁切（只为「把模型输出修边到请求尺寸」这一件事存在）。
 *
 * 背景（2026-09-16 线上）：百炼生图模型的输出尺寸网格是 **64 的倍数**，
 * 请求 `1920*1080` 实际返回 `1920×1088`（1088 = 64×17）。而编排者按用户原话生成的
 * 验收判据写着「图片为 1920×1080」，于是这道门禁**永远不可能通过** ——
 * 子任务被判 failed → 重试 4 次 → 每次再出一张图 → 整组失败。
 *
 * 修法：模型输出的差异只是「网格取整的几像素」，交付前把它裁到请求尺寸即可，
 * 既不放大也不补像素、不改变构图中心。项目里没有任何图像库（sharp/jimp/pngjs 都没有），
 * 所以这里用 Node 内置 zlib 自己解/编 PNG。
 *
 * 支持范围：bitDepth 8、colorType 2(RGB)/6(RGBA)、非隔行 —— 实测百炼产物正是这个形态。
 * 其余形态返回 null，调用方退回「不做裁切」，绝不冒险产出坏图。
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHANNELS_BY_COLOR_TYPE: Record<number, 3 | 4> = { 2: 3, 6: 4 }
/** 防御：解出的图不超过 4000 万像素，避免异常 PNG 打爆内存。 */
const MAX_PIXELS = 40_000_000

export interface PngHeader {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

export interface PngImage {
  width: number
  height: number
  channels: 3 | 4
  /** 逐行紧密排列的原始像素（不含每行开头的 filter 字节），长度 = height × width × channels */
  pixels: Buffer
}

/** 只读 IHDR，不解压 —— 尺寸探测用，纯读头，永不抛。 */
export function readPngHeader(buffer: Buffer): PngHeader | null {
  try {
    if (buffer.length < 33) return null
    if (!buffer.subarray(0, 8).equals(SIGNATURE)) return null
    if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      bitDepth: buffer[24],
      colorType: buffer[25],
      interlace: buffer[28],
    }
  } catch {
    return null
  }
}

/** 这个 PNG 能不能被本模块解/编？不能就返回 false，调用方别指望裁切。 */
export function isCropSupported(buffer: Buffer): boolean {
  const header = readPngHeader(buffer)
  if (!header) return false
  if (header.bitDepth !== 8) return false
  if (!(header.colorType in CHANNELS_BY_COLOR_TYPE)) return false
  return header.interlace === 0
}

/** 解 PNG；形态不支持或数据损坏时返回 null。 */
export function decodePng(buffer: Buffer): PngImage | null {
  const header = readPngHeader(buffer)
  if (!header || !isCropSupported(buffer)) return null
  const { width, height } = header
  if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) return null
  const channels = CHANNELS_BY_COLOR_TYPE[header.colorType]
  const bytesPerPixel = channels

  // 逐 chunk 走，只为拼出完整的 IDAT 数据。
  const idatParts: Buffer[] = []
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) return null
    if (type === 'IDAT') idatParts.push(buffer.subarray(dataStart, dataEnd))
    if (type === 'IEND') break
    offset = dataEnd + 4
  }
  if (idatParts.length === 0) return null

  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(idatParts))
  } catch {
    return null
  }

  const stride = width * bytesPerPixel
  if (raw.length < height * (stride + 1)) return null

  const pixels = Buffer.allocUnsafe(stride * height)
  let prev: Buffer = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[y * (stride + 1)]
    const source = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    if (!unfilterRow(filterType, source, row, prev, bytesPerPixel)) return null
    prev = row
  }

  return { width, height, channels, pixels }
}

/** 编 PNG（自适应行滤波，体积接近常见编码器；不写入任何 ancillary chunk）。 */
export function encodePng(image: PngImage): Buffer {
  const { width, height, channels, pixels } = image
  const stride = width * channels
  const filtered = Buffer.allocUnsafe((stride + 1) * height)
  // 上一行的重建像素（反向滤波的输入），用于 Sub/Up/Average/Paeth 的预测。
  let prev: Buffer = Buffer.alloc(stride)
  const candidates: Buffer[] = [
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride),
  ]

  for (let y = 0; y < height; y += 1) {
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    for (let f = 0; f < 5; f += 1) filterRow(f, row, prev, candidates[f], channels)

    let best = 0
    let bestScore = Infinity
    for (let f = 0; f < 5; f += 1) {
      // libpng 的经典启发式：把字节当有符号数取绝对值再求和，越小越「平整」。
      let score = 0
      const candidate = candidates[f]
      for (let i = 0; i < stride; i += 1) {
        const v = candidate[i]
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        best = f
      }
    }

    filtered[y * (stride + 1)] = best
    candidates[best].copy(filtered, y * (stride + 1) + 1)
    prev = row
  }

  const colorType = channels === 4 ? 6 : 2
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bitDepth
  ihdr[9] = colorType
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('IDAT', deflateSync(filtered, { level: 6 })),
    buildChunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * 把 PNG 居中裁到目标尺寸（只裁不缩，绝不放大或补像素）。
 *
 * 目标比原图大、形态不支持、或裁掉的部分超出「修边」量级时返回 null ——
 * 调用方据此放弃裁切（例如模型给了个完全不同的尺寸，那本来就该判交付不合格）。
 */
export function cropPng(buffer: Buffer, targetWidth: number, targetHeight: number): Buffer | null {
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight)) return null
  if (targetWidth <= 0 || targetHeight <= 0) return null
  const image = decodePng(buffer)
  if (!image) return null
  if (targetWidth > image.width || targetHeight > image.height) return null

  const left = Math.floor((image.width - targetWidth) / 2)
  const top = Math.floor((image.height - targetHeight) / 2)
  const rowBytes = targetWidth * image.channels
  const cropped = Buffer.allocUnsafe(rowBytes * targetHeight)

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceStart = ((top + y) * image.width + left) * image.channels
    image.pixels.copy(cropped, y * rowBytes, sourceStart, sourceStart + rowBytes)
  }

  return encodePng({
    width: targetWidth,
    height: targetHeight,
    channels: image.channels,
    pixels: cropped,
  })
}

// ─── 行滤波 ───────────────────────────────────────────────────────────────────

function unfilterRow(
  filterType: number,
  source: Buffer,
  target: Buffer,
  prev: Buffer,
  bpp: number,
): boolean {
  const length = target.length
  switch (filterType) {
    case 0:
      source.copy(target)
      return true
    case 1:
      for (let i = 0; i < length; i += 1) {
        target[i] = (source[i] + (i >= bpp ? target[i - bpp] : 0)) & 0xff
      }
      return true
    case 2:
      for (let i = 0; i < length; i += 1) target[i] = (source[i] + prev[i]) & 0xff
      return true
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bpp ? target[i - bpp] : 0
        target[i] = (source[i] + ((left + prev[i]) >> 1)) & 0xff
      }
      return true
    case 4:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bpp ? target[i - bpp] : 0
        const upLeft = i >= bpp ? prev[i - bpp] : 0
        target[i] = (source[i] + paeth(left, prev[i], upLeft)) & 0xff
      }
      return true
    default:
      return false
  }
}

function filterRow(
  filterType: number,
  row: Buffer,
  prev: Buffer,
  target: Buffer,
  bpp: number,
): void {
  const length = row.length
  switch (filterType) {
    case 0:
      row.copy(target)
      return
    case 1:
      for (let i = 0; i < length; i += 1) {
        target[i] = (row[i] - (i >= bpp ? row[i - bpp] : 0)) & 0xff
      }
      return
    case 2:
      for (let i = 0; i < length; i += 1) target[i] = (row[i] - prev[i]) & 0xff
      return
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0
        target[i] = (row[i] - ((left + prev[i]) >> 1)) & 0xff
      }
      return
    default:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0
        const upLeft = i >= bpp ? prev[i - bpp] : 0
        target[i] = (row[i] - paeth(left, prev[i], upLeft)) & 0xff
      }
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

// ─── chunk / CRC32 ───────────────────────────────────────────────────────────

function buildChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.allocUnsafe(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 'latin1')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length)
  return chunk
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}
