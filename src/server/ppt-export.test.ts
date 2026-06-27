import { describe, expect, it } from 'vitest'

import { slidesToPptxBuffer } from './ppt-export'

describe('slidesToPptxBuffer', () => {
  it('produces a non-empty .pptx (ZIP) buffer for legacy slides', async () => {
    const buf = await slidesToPptxBuffer(
      {
        type: 'ppt',
        title: 'Test Deck',
        slides: [
          { title: '封面', layout: 'title' },
          { title: '要点', bullets: ['一', '二'], notes: '备注' },
        ],
      },
      'fallback',
    )
    expect(buf.length).toBeGreaterThan(0)
    // .pptx 是 ZIP 容器，前两字节为 ZIP 魔数 'PK'
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
  })

  it('produces a non-empty .pptx (ZIP) buffer for enhanced block slides', async () => {
    const buf = await slidesToPptxBuffer(
      {
        type: 'ppt',
        title: 'Enhanced Deck',
        slides: [
          {
            title: '指标概览',
            subtitle: 'Q2',
            layout: 'metrics',
            blocks: [
              { type: 'metric', label: '收入', value: '1200万', change: '+18%', tone: 'positive' },
              { type: 'metric', label: '风险', value: '3项', change: '需跟进', tone: 'warning' },
            ],
          },
          {
            title: '路线图',
            layout: 'timeline',
            blocks: [
              {
                type: 'timeline',
                items: [
                  { label: 'Q1', title: '验证', text: '完成样机' },
                  { label: 'Q2', title: '上线', text: '灰度发布' },
                ],
              },
            ],
          },
        ],
      },
      'fallback',
    )
    expect(buf.length).toBeGreaterThan(0)
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
  })
})
