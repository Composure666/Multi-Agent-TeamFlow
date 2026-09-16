import { describe, expect, it } from 'vitest'

import {
  AGENT_TOOL_PRESETS,
  ALWAYS_ON_AGENT_TOOLS,
  AVAILABLE_AGENT_TOOLS,
  DEFAULT_CUSTOM_AGENT_TOOLS,
  buildToolPermissionSummaries,
  normalizeAgentToolNames,
  withAlwaysOnAgentTools,
} from './agent-builder-config'

describe('always-on network tools', () => {
  it('declares both network tools as embedded', () => {
    expect([...ALWAYS_ON_AGENT_TOOLS].sort()).toEqual(['web_fetch', 'web_search'])
    for (const tool of ALWAYS_ON_AGENT_TOOLS) {
      expect(AVAILABLE_AGENT_TOOLS).toContain(tool)
    }
  })

  it('is included in the default tool set and every preset', () => {
    for (const tool of ALWAYS_ON_AGENT_TOOLS) {
      expect([...DEFAULT_CUSTOM_AGENT_TOOLS]).toContain(tool)
    }
    for (const preset of AGENT_TOOL_PRESETS) {
      for (const tool of ALWAYS_ON_AGENT_TOOLS) {
        expect([...preset.tools], `preset ${preset.id}`).toContain(tool)
      }
    }
  })

  it('backfills missing tools without reordering or duplicating', () => {
    expect(withAlwaysOnAgentTools(['fs_read'])).toEqual(['fs_read', 'web_search', 'web_fetch'])
    expect(withAlwaysOnAgentTools(['web_fetch', 'fs_read'])).toEqual(['web_fetch', 'fs_read', 'web_search'])
    expect(withAlwaysOnAgentTools(['web_search', 'web_fetch'])).toEqual(['web_search', 'web_fetch'])
    expect(withAlwaysOnAgentTools([])).toEqual(['web_search', 'web_fetch'])
  })

  it('keeps the permission summary aligned with what runs', () => {
    const summaries = buildToolPermissionSummaries(['fs_read'])
    const names = summaries.map((summary) => summary.toolName)

    for (const tool of ALWAYS_ON_AGENT_TOOLS) {
      expect(names).toContain(tool)
      expect(summaryName(summaries, tool)).toBeTruthy()
    }
    expect(names).toContain('fs_read')
  })

  it('still rejects unknown tool names', () => {
    expect(normalizeAgentToolNames(['fs_read', 'nope'])).toEqual(['fs_read'])
  })
})

function summaryName(summaries: ReturnType<typeof buildToolPermissionSummaries>, toolName: string) {
  return summaries.find((summary) => summary.toolName === toolName)?.label
}
