import { describe, expect, it } from 'vitest'

import {
  DEMO_AGENTS,
  DEMO_ARTIFACTS,
  DEMO_CONVERSATION,
  DEMO_CONVERSATION_ID,
  DEMO_DISPATCH_PLAN,
  DEMO_TURNS,
  DEMO_USER_MESSAGE,
} from './demo-seed'

describe('demo seed integrity', () => {
  it('uses only the five builtin agents', () => {
    const ids = DEMO_AGENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(5)
    expect(ids).toEqual(
      expect.arrayContaining([
        'ag_orchestrator',
        'ag_pm',
        'ag_designer',
        'ag_frontend',
        'ag_reviewer',
      ]),
    )
    expect(DEMO_CONVERSATION.agentIds.every((id) => ids.includes(id))).toBe(true)
    expect(DEMO_USER_MESSAGE.conversationId).toBe(DEMO_CONVERSATION_ID)
    expect(DEMO_USER_MESSAGE.role).toBe('user')
  })

  it('has unique message and run ids across turns', () => {
    const messageIds = DEMO_TURNS.map((t) => t.messageId)
    const runIds = DEMO_TURNS.map((t) => t.runId)
    expect(new Set(messageIds).size).toBe(messageIds.length)
    expect(new Set(runIds).size).toBe(runIds.length)
    expect(DEMO_TURNS.every((t) => DEMO_AGENTS.some((a) => a.id === t.agentId))).toBe(true)
    expect(DEMO_TURNS.map((t) => t.agentId)).toEqual([
      'ag_orchestrator',
      'ag_pm',
      'ag_designer',
      'ag_frontend',
      'ag_reviewer',
    ])
  })

  it('references only existing artifacts, each created once', () => {
    const artifactIds = DEMO_ARTIFACTS.map((a) => a.id)
    expect(new Set(artifactIds).size).toBe(artifactIds.length)
    expect(artifactIds).toEqual(
      expect.arrayContaining([
        'art_demo_prd',
        'art_demo_design_guide',
        'art_demo_web_app',
        'art_demo_review',
      ]),
    )
    for (const turn of DEMO_TURNS) {
      for (const step of turn.steps) {
        if (step.kind !== 'artifact') continue
        expect(artifactIds).toContain(step.artifact.id)
        expect(DEMO_AGENTS.some((a) => a.id === step.artifact.createdByAgentId)).toBe(true)
      }
    }
    const created = DEMO_TURNS.flatMap((t) =>
      t.steps.filter((s) => s.kind === 'artifact').map((s) => s.artifact.id),
    )
    expect(new Set(created).size).toBe(created.length)
    expect(created).toHaveLength(4)
  })

  it('has a dispatch plan whose tasks and dependencies all resolve', () => {
    const taskIds = DEMO_DISPATCH_PLAN.map((t) => t.id)
    expect(new Set(taskIds).size).toBe(taskIds.length)
    for (const task of DEMO_DISPATCH_PLAN) {
      expect(DEMO_AGENTS.some((a) => a.id === task.agentId)).toBe(true)
      for (const dep of task.dependsOn ?? []) {
        expect(taskIds).toContain(dep)
      }
    }
  })

  it('keeps the web_app artifact self-contained (no external URLs)', () => {
    const webApp = DEMO_ARTIFACTS.find((a) => a.type === 'web_app')
    expect(webApp).toBeDefined()
    if (!webApp || webApp.content.type !== 'web_app') throw new Error('unreachable')
    const entry = webApp.content.files[webApp.content.entry]
    expect(entry).toBeTruthy()
    expect(entry.length).toBeGreaterThan(0)
    for (const file of Object.values(webApp.content.files)) {
      expect(file).not.toMatch(/https?:\/\//)
    }
  })
})
