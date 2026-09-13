import { and, asc, desc, eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import { newTeamId, newTeamMemberId } from '@/server/ids'

/**
 * Agent 团队服务。
 *
 * 团队是一组 Agent 的集合，每个成员有角色、排序、是否负责人。
 * 团队对话时按 sort_order 串行调度，is_lead 的成员负责汇总。
 */

export interface TeamMemberInput {
  agentId: string
  role?: string
  isLead?: boolean
  sortOrder?: number
}

export interface CreateTeamArgs {
  name: string
  avatar?: string
  description?: string
  goal?: string
  systemPrompt?: string
  members?: TeamMemberInput[]
}

export interface UpdateTeamArgs {
  name?: string
  avatar?: string
  description?: string
  goal?: string
  systemPrompt?: string
}

export interface TeamWithMembers {
  id: string
  name: string
  avatar: string
  description: string
  goal: string
  systemPrompt: string
  createdAt: number
  updatedAt: number
  members: Array<{
    id: string
    agentId: string
    agentName: string
    agentAvatar: string
    role: string
    sortOrder: number
    isLead: boolean
  }>
}

// ─── 团队 CRUD ────────────────────────────────────────────────

export async function createTeam(args: CreateTeamArgs): Promise<TeamWithMembers> {
  const id = newTeamId()
  const now = Date.now()

  await db.insert(schema.agentTeams).values({
    id,
    name: args.name,
    avatar: args.avatar ?? '👥',
    description: args.description ?? '',
    goal: args.goal ?? '',
    systemPrompt: args.systemPrompt ?? '',
    createdAt: now,
    updatedAt: now,
  })

  if (args.members?.length) {
    for (let i = 0; i < args.members.length; i++) {
      const m = args.members[i]
      await db.insert(schema.agentTeamMembers).values({
        id: newTeamMemberId(),
        teamId: id,
        agentId: m.agentId,
        role: m.role ?? '',
        sortOrder: m.sortOrder ?? i,
        isLead: m.isLead ?? false,
        createdAt: now,
      })
    }
  }

  // 把负责人设为 Orchestrator（团队对话时由它调度其他成员）
  const leadMember = args.members?.find((m) => m.isLead)
  if (leadMember) {
    await db
      .update(schema.agents)
      .set({ isOrchestrator: true })
      .where(eq(schema.agents.id, leadMember.agentId))
  }

  return getTeam(id)
}

export async function updateTeam(id: string, args: UpdateTeamArgs): Promise<TeamWithMembers> {
  const existing = await db.select().from(schema.agentTeams).where(eq(schema.agentTeams.id, id)).get()
  if (!existing) throw new Error(`Team not found: ${id}`)

  await db
    .update(schema.agentTeams)
    .set({
      name: args.name ?? existing.name,
      avatar: args.avatar ?? existing.avatar,
      description: args.description ?? existing.description,
      goal: args.goal ?? existing.goal,
      systemPrompt: args.systemPrompt ?? existing.systemPrompt,
      updatedAt: Date.now(),
    })
    .where(eq(schema.agentTeams.id, id))

  return getTeam(id)
}

export async function deleteTeam(id: string): Promise<void> {
  await db.delete(schema.agentTeams).where(eq(schema.agentTeams.id, id))
}

export async function listTeams(): Promise<Array<TeamWithMembers & { memberCount: number }>> {
  const teams = await db.select().from(schema.agentTeams).orderBy(desc(schema.agentTeams.createdAt))
  const result = []
  for (const t of teams) {
    const members = await getTeamMembers(t.id)
    result.push({ ...t, members, memberCount: members.length })
  }
  return result
}

export async function getTeam(id: string): Promise<TeamWithMembers> {
  const team = await db.select().from(schema.agentTeams).where(eq(schema.agentTeams.id, id)).get()
  if (!team) throw new Error(`Team not found: ${id}`)
  const members = await getTeamMembers(id)
  return { ...team, members }
}

// ─── 成员管理 ─────────────────────────────────────────────────

async function getTeamMembers(teamId: string) {
  const rows = await db
    .select({
      id: schema.agentTeamMembers.id,
      agentId: schema.agentTeamMembers.agentId,
      agentName: schema.agents.name,
      agentAvatar: schema.agents.avatar,
      role: schema.agentTeamMembers.role,
      sortOrder: schema.agentTeamMembers.sortOrder,
      isLead: schema.agentTeamMembers.isLead,
    })
    .from(schema.agentTeamMembers)
    .innerJoin(schema.agents, eq(schema.agentTeamMembers.agentId, schema.agents.id))
    .where(eq(schema.agentTeamMembers.teamId, teamId))
    .orderBy(asc(schema.agentTeamMembers.sortOrder))
  return rows
}

export async function addMember(
  teamId: string,
  input: TeamMemberInput,
): Promise<TeamWithMembers> {
  const team = await db.select().from(schema.agentTeams).where(eq(schema.agentTeams.id, teamId)).get()
  if (!team) throw new Error(`Team not found: ${teamId}`)

  // 检查是否已存在
  const existing = await db
    .select()
    .from(schema.agentTeamMembers)
    .where(and(eq(schema.agentTeamMembers.teamId, teamId), eq(schema.agentTeamMembers.agentId, input.agentId)))
    .get()
  if (existing) throw new Error('该 Agent 已在团队中')

  const count = await db
    .select({ id: schema.agentTeamMembers.id })
    .from(schema.agentTeamMembers)
    .where(eq(schema.agentTeamMembers.teamId, teamId))
    .all()

  await db.insert(schema.agentTeamMembers).values({
    id: newTeamMemberId(),
    teamId,
    agentId: input.agentId,
    role: input.role ?? '',
    sortOrder: input.sortOrder ?? count.length,
    isLead: input.isLead ?? false,
    createdAt: Date.now(),
  })

  return getTeam(teamId)
}

export async function removeMember(memberId: string): Promise<void> {
  await db.delete(schema.agentTeamMembers).where(eq(schema.agentTeamMembers.id, memberId))
}

export async function updateMember(
  memberId: string,
  args: { role?: string; isLead?: boolean; sortOrder?: number },
): Promise<void> {
  const existing = await db.select().from(schema.agentTeamMembers).where(eq(schema.agentTeamMembers.id, memberId)).get()
  if (!existing) throw new Error(`Team member not found: ${memberId}`)

  await db
    .update(schema.agentTeamMembers)
    .set({
      role: args.role ?? existing.role,
      isLead: args.isLead ?? existing.isLead,
      sortOrder: args.sortOrder ?? existing.sortOrder,
    })
    .where(eq(schema.agentTeamMembers.id, memberId))
}

/** 全量替换团队成员（用于编辑时一次性设置） */
export async function setTeamMembers(teamId: string, members: TeamMemberInput[]): Promise<TeamWithMembers> {
  const team = await db.select().from(schema.agentTeams).where(eq(schema.agentTeams.id, teamId)).get()
  if (!team) throw new Error(`Team not found: ${teamId}`)

  // 删除旧成员
  await db.delete(schema.agentTeamMembers).where(eq(schema.agentTeamMembers.teamId, teamId))

  // 插入新成员
  const now = Date.now()
  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    await db.insert(schema.agentTeamMembers).values({
      id: newTeamMemberId(),
      teamId,
      agentId: m.agentId,
      role: m.role ?? '',
      sortOrder: m.sortOrder ?? i,
      isLead: m.isLead ?? false,
      createdAt: now,
    })
  }

  return getTeam(teamId)
}
