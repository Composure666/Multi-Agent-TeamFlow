import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  cropPng,
  decodePng,
  encodePng,
  isCropSupported,
  readPngHeader,
  type PngImage,
} from './png-crop'

/**
 * 回归：百炼生图模型的输出尺寸网格是 64 的倍数 —— 请求 `1920*1080` 实得 `1920×1088`，
 * 于是编排者写的验收判据「图片为 1920×1080」**永远不可能通过**（线上 t4 连续 4 次失败）。
 *
 * 交付前把这几像素修边掉即可，而项目里没有任何图像库（sharp/jimp/pngjs 都没有），
 * 所以 png-crop 用 Node 内置 zlib 自己解/编 PNG。这里验证编解码正确性与裁切语义。
 */

/** 造一张有可辨认内容的图（横向渐变 + 竖向条纹），避免「纯色图看不出裁错行」。 */
function makeImage(width: number, height: number, channels: 3 | 4 = 3): PngImage {
  const pixels = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels
      pixels[index] = (x * 7) & 0xff
      pixels[index + 1] = (y * 5) & 0xff
      pixels[index + 2] = (x + y) & 0xff
      if (channels === 4) pixels[index + 3] = 255
    }
  }
  return { width, height, channels, pixels }
}

describe('png-crop', () => {
  it('编码后再解码，像素逐字节一致（RGB）', () => {
    const image = makeImage(64, 40, 3)
    const decoded = decodePng(encodePng(image))
    expect(decoded).not.toBeNull()
    expect(decoded?.width).toBe(64)
    expect(decoded?.height).toBe(40)
    expect(decoded?.channels).toBe(3)
    expect(decoded?.pixels.equals(image.pixels)).toBe(true)
  })

  it('编码后再解码，像素逐字节一致（RGBA）', () => {
    const image = makeImage(33, 17, 4)
    const decoded = decodePng(encodePng(image))
    expect(decoded?.channels).toBe(4)
    expect(decoded?.pixels.equals(image.pixels)).toBe(true)
  })

  it('编码结果的结构合法：签名 / IHDR 字段 / IDAT 能解压出整行数据', () => {
    const image = makeImage(20, 12, 3)
    const png = encodePng(image)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

    const header = readPngHeader(png)
    expect(header).toEqual({
      width: 20,
      height: 12,
      bitDepth: 8,
      colorType: 2,
      interlace: 0,
    })

    // 拼出 IDAT 并解压：每行 = 1 字节 filter + 20×3 字节像素
    const idat: Buffer[] = []
    let offset = 8
    while (offset + 12 <= png.length) {
      const length = png.readUInt32BE(offset)
      const type = png.toString('latin1', offset + 4, offset + 8)
      if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
      if (type === 'IEND') break
      offset += 12 + length
    }
    expect(inflateSync(Buffer.concat(idat)).length).toBe(12 * (20 * 3 + 1))
  })

  it('居中裁切：尺寸按目标走，内容就是原图正中那几行', () => {
    const image = makeImage(32, 20, 3)
    const cropped = cropPng(encodePng(image), 32, 12)
    expect(cropped).not.toBeNull()

    const decoded = decodePng(cropped as Buffer)
    expect(decoded?.width).toBe(32)
    expect(decoded?.height).toBe(12)

    // 差 8 行 → 上下各裁 4 行，裁完的内容应等于原图第 4..15 行
    const expected = image.pixels.subarray(4 * 32 * 3, 16 * 32 * 3)
    expect(decoded?.pixels.equals(expected)).toBe(true)
  })

  it('纵向差值下也一样居中（列方向）', () => {
    const image = makeImage(40, 10, 3)
    const decoded = decodePng(cropPng(encodePng(image), 36, 10) as Buffer)
    expect(decoded?.width).toBe(36)
    // 差 4 列 → 左右各裁 2 列：每行取原行第 2..37 列的像素
    for (let y = 0; y < 10; y += 1) {
      const rowStart = y * 40 * 3
      const expected = image.pixels.subarray(rowStart + 2 * 3, rowStart + 38 * 3)
      const actual = decoded?.pixels.subarray(y * 36 * 3, (y + 1) * 36 * 3)
      expect(actual?.equals(expected)).toBe(true)
    }
  })

  it('目标比原图大 → 拒绝（绝不放大或补像素）', () => {
    const png = encodePng(makeImage(16, 16, 3))
    expect(cropPng(png, 32, 32)).toBeNull()
    expect(cropPng(png, 16, 20)).toBeNull()
  })

  it('目标尺寸非法 → 拒绝', () => {
    const png = encodePng(makeImage(16, 16, 3))
    expect(cropPng(png, 0, 16)).toBeNull()
    expect(cropPng(png, 12.5, 16)).toBeNull()
  })

  it('形态不支持的图：16bit / 隔行 / 非 PNG 一律不认', () => {
    const png = encodePng(makeImage(16, 16, 3))

    const sixteenBit = Buffer.from(png)
    sixteenBit[24] = 16
    expect(isCropSupported(sixteenBit)).toBe(false)
    expect(cropPng(sixteenBit, 8, 8)).toBeNull()

    const interlaced = Buffer.from(png)
    interlaced[28] = 1
    expect(isCropSupported(interlaced)).toBe(false)
    expect(cropPng(interlaced, 8, 8)).toBeNull()

    expect(isCropSupported(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(false)
    expect(decodePng(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull()
  })

  it('IDAT 被破坏 → 解码失败返回 null，不抛异常', () => {
    const image = makeImage(64, 64, 3)
    const png = encodePng(image)
    // 定位第一个 IDAT 的数据段并改一个字节：zlib 尾部有 Adler-32，解压时必须报错
    let offset = 8
    let corrupted = false
    while (offset + 12 <= png.length) {
      const length = png.readUInt32BE(offset)
      if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
        png[offset + 8 + Math.floor(length / 2)] ^= 0xff
        corrupted = true
        break
      }
      offset += 12 + length
    }
    expect(corrupted).toBe(true)
    expect(() => decodePng(png)).not.toThrow()
    expect(decodePng(png)).toBeNull()
  })

  it('只有 IHDR、没有 IDAT 的截断头 → 不认（线上单测的 pngBuffer 助手就是这种）', () => {
    const headerOnly = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(headerOnly, 0)
    headerOnly.writeUInt32BE(13, 8)
    headerOnly.write('IHDR', 12, 'latin1')
    headerOnly.writeUInt32BE(100, 16)
    headerOnly.writeUInt32BE(100, 20)
    headerOnly.writeUInt8(8, 24)
    headerOnly.writeUInt8(6, 25)
    expect(isCropSupported(headerOnly)).toBe(true)
    expect(decodePng(headerOnly)).toBeNull()
    expect(cropPng(headerOnly, 50, 50)).toBeNull()
  })
})
