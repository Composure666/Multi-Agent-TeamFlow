import { describe, expect, it } from 'vitest'

import { WORKBENCH_NAVIGATION } from './workbench-navigation'

describe('workbench navigation', () => {
  it('keeps every navigable workspace view represented exactly once', () => {
    const ids = WORKBENCH_NAVIGATION.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['conversations', 'information-center', 'agents', 'capability-center', 'artifacts', 'experiences', 'automation', 'run-board', 'analytics'])
  })
})
