export function createAdapterSessionStore(namespace: string): Map<string, string> {
  const globalStore = globalThis as unknown as {
    __agenthubAdapterSessions?: Record<string, Map<string, string>>
  }
  globalStore.__agenthubAdapterSessions ??= {}
  globalStore.__agenthubAdapterSessions[namespace] ??= new Map()
  return globalStore.__agenthubAdapterSessions[namespace]
}

export function adapterSessionKey(conversationId: string, agentId: string): string {
  return `${conversationId}:${agentId}`
}

export const claudeCodeSessions = createAdapterSessionStore('claude-code')
export const codexSessions = createAdapterSessionStore('codex')

export function clearClaudeCodeSession(conversationId: string): void {
  claudeCodeSessions.delete(conversationId)
}

export function clearCodexSession(conversationId: string): void {
  for (const key of codexSessions.keys()) {
    if (key.startsWith(`${conversationId}:`)) codexSessions.delete(key)
  }
}
