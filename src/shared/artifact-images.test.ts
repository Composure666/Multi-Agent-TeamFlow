import { describe, expect, it } from 'vitest'

import { countArtifactImages, readArtifactImages } from '@/shared/artifact-images'
import type { ArtifactContent } from '@/shared/types'

/**
 * 图片图集的读取契约。
 *
 * 一次「电商爆图工厂」任务会连出 7、8 张图，写入侧会把它们合并进同一个产物的
 * content.images。所有读图的地方都必须走 readArtifactImages —— 直接读 content.url
 * 会让图集里除封面外的图全部消失。
 */

describe('readArtifactImages', () => {
  it('老数据（只有 url）兜底成单图', () => {
    const content: ArtifactContent = { type: 'image', url: 'https://x/a.png', alt: 'alt-text' }
    expect(readArtifactImages(content)).toEqual([{ url: 'https://x/a.png', alt: 'alt-text' }])
    expect(countArtifactImages(content)).toBe(1)
  })

  it('图集返回全部图片，封面排在第一位', () => {
    const content: ArtifactContent = {
      type: 'image',
      url: 'https://x/a.png',
      alt: '封面',
      images: [
        { url: 'https://x/a.png', alt: '封面' },
        { url: 'https://x/b.png', alt: '第二张' },
        { url: 'https://x/c.png', alt: '第三张' },
      ],
    }
    const images = readArtifactImages(content)
    expect(images.map((i) => i.url)).toEqual(['https://x/a.png', 'https://x/b.png', 'https://x/c.png'])
    expect(countArtifactImages(content)).toBe(3)
  })

  it('images 为空数组时回退到 url，不会返回空图集', () => {
    const content = { type: 'image', url: 'https://x/a.png', alt: '', images: [] } as ArtifactContent
    expect(readArtifactImages(content)).toEqual([{ url: 'https://x/a.png', alt: '' }])
  })

  it('按 url 去重，重复追加同一张图不会让角标数字虚高', () => {
    const content = {
      type: 'image',
      url: 'https://x/a.png',
      images: [
        { url: 'https://x/a.png' },
        { url: 'https://x/a.png' },
        { url: 'https://x/b.png' },
      ],
    } as ArtifactContent
    expect(countArtifactImages(content)).toBe(2)
  })

  it('脏数据不会抛异常', () => {
    expect(readArtifactImages(null)).toEqual([])
    expect(readArtifactImages({ type: 'image' })).toEqual([])
    expect(readArtifactImages({ type: 'image', url: '', images: [null, 42, {}] })).toEqual([])
    expect(countArtifactImages(undefined)).toBe(0)
  })
})
