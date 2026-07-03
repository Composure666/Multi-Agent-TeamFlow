import { describe, expect, it } from 'vitest'

import { isDuplicateColumnError } from './migration-utils'

describe('isDuplicateColumnError', () => {
  it('detects duplicate column errors wrapped as a cause', () => {
    const err = new Error('Failed to run the query')
    err.cause = new Error('duplicate column name: pinned_at')

    expect(isDuplicateColumnError(err)).toBe(true)
  })
})
