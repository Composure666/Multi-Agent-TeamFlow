import { describe, expect, it } from 'vitest'

import { resizeConversationPanelWidth } from './conversation-workspace'

describe('resizeConversationPanelWidth', () => {
  it('moves opposite to the pointer delta and clamps the panel width', () => {
    // 期望值跟随 MIN/MAX 两个常量。二者在 cf6e3c8 由 280/560 提到 320/760，
    // 本文件的断言当时漏改 → 用例长期为红，且第 4 行被第 3 行挡住看不见。
    expect(resizeConversationPanelWidth(360, 40)).toBe(320) // 360-40=320 → 正好落在 MIN
    expect(resizeConversationPanelWidth(360, -80)).toBe(440) // 未触边界
    expect(resizeConversationPanelWidth(300, 100)).toBe(320) // 300-100=200 → 夹到 MIN
    expect(resizeConversationPanelWidth(540, -100)).toBe(640) // 未触边界
    expect(resizeConversationPanelWidth(700, -100)).toBe(760) // 800 → 夹到 MAX
  })
})
