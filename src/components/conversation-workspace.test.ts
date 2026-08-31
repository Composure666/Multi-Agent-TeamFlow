import { describe, expect, it } from 'vitest'

import { resizeConversationPanelWidth } from './conversation-workspace'

describe('resizeConversationPanelWidth', () => {
  it('moves opposite to the pointer delta and clamps the panel width', () => {
    expect(resizeConversationPanelWidth(360, 40)).toBe(320)
    expect(resizeConversationPanelWidth(360, -80)).toBe(440)
    expect(resizeConversationPanelWidth(300, 100)).toBe(280)
    expect(resizeConversationPanelWidth(540, -100)).toBe(560)
  })
})
