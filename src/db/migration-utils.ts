export function isDuplicateColumnError(err: unknown): boolean {
  let current: unknown = err
  while (current instanceof Error) {
    if (current.message.toLowerCase().includes('duplicate column')) return true
    current = current.cause
  }
  return false
}
