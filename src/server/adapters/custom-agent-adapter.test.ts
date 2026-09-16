import { describe, expect, it } from 'vitest'

import { CUSTOM_AGENT_MAX_TURNS } from './custom-agent-adapter'

describe('CustomAgentAdapter turn budget', () => {
  it('allows enough tool turns for implementation agents to inspect and write', () => {
    expect(CUSTOM_AGENT_MAX_TURNS).toBeGreaterThanOrEqual(32)
  })
})
