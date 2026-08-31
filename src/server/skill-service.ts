import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

import { asc, eq, inArray } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import type { AdapterName } from '@/shared/types'

export interface SkillListItem {
  id: string
  name: string
  description: string
  content: string | null
  sourcePath: string
  tags: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  tags: string[]
  enabled: boolean
  sourcePath: string
  status: 'enabled' | 'disabled'
  compatibility: Record<AdapterName, 'supported' | 'unsupported'>
}

export interface SkillPatch {
  enabled?: boolean
}

const SKILLS_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'skills')
const MAX_DESCRIPTION_CHARS = 280

export async function listSkills(): Promise<SkillListItem[]> {
  await refreshSkillsFromDisk()
  const rows = await db.query.skills.findMany({ orderBy: [asc(schema.skills.name)] })
  return rows.map(toSkillListItem)
}

export async function listEnabledSkillsByIds(ids: string[]): Promise<SkillListItem[]> {
  if (ids.length === 0) return []
  const rows = await db.query.skills.findMany({ where: inArray(schema.skills.id, ids) })
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<(typeof rows)[number]> => !!row && row.enabled)
    .map(toSkillListItem)
}

export async function listSkillCatalogItems(): Promise<SkillCatalogItem[]> {
  const skills = await listSkills()
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags,
    enabled: skill.enabled,
    sourcePath: skill.sourcePath,
    status: skill.enabled ? 'enabled' : 'disabled',
    compatibility: {
      'claude-code': skill.enabled ? 'supported' : 'unsupported',
      codex: skill.enabled ? 'supported' : 'unsupported',
      custom: skill.enabled ? 'supported' : 'unsupported',
      mock: skill.enabled ? 'supported' : 'unsupported',
    },
  }))
}

export async function updateSkill(id: string, patch: SkillPatch): Promise<SkillListItem> {
  const existing = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) })
  if (!existing) throw new Error(`Skill not found: ${id}`)

  const updates: Partial<typeof schema.skills.$inferInsert> = { updatedAt: Date.now() }
  if (patch.enabled !== undefined) updates.enabled = patch.enabled

  await db.update(schema.skills).set(updates).where(eq(schema.skills.id, id))
  const updated = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) })
  if (!updated) throw new Error(`Skill update succeeded but row missing: ${id}`)
  return toSkillListItem(updated)
}

export async function discoverWorkspaceSkills(workspaceRootPath: string): Promise<SkillListItem[]> {
  try {
    const mdFiles = findSkillFilesRecursive(workspaceRootPath)
    if (mdFiles.length === 0) return []

    const now = Date.now()
    const discovered: SkillListItem[] = []
    for (const filePath of mdFiles) {
      const raw = readFileSync(filePath, 'utf8')
      const baseName = path.basename(filePath, '.md')
      const parsed = parseMarkdownWithFrontmatter(raw, baseName)
      if (parsed.description === 'Skill' && !parsed.content) continue

      discovered.push({
        id: `ws_skill_${workspaceSkillId(workspaceRootPath, filePath)}`,
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        sourcePath: filePath,
        tags: parsed.tags,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
    }
    return discovered
  } catch {
    return []
  }
}

/**
 * 递归扫描 workspace 下所有名为 SKILL.md 或位于 skills/ 目录下的 .md 文件。
 * 兼容 Agent 把技能 clone 到任意子目录的场景。
 */
function findSkillFilesRecursive(dir: string, depth = 0): string[] {
  if (depth > 4) return []
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // 在 skills/ 目录内递归收集所有 .md 文件
        if (entry.name === 'skills') {
          results.push(...findMdFilesRecursive(fullPath))
        } else {
          results.push(...findSkillFilesRecursive(fullPath, depth + 1))
        }
      } else if (entry.isFile() && entry.name.toUpperCase() === 'SKILL.MD') {
        // 顶层/子目录的 SKILL.md 直接算技能文件
        results.push(fullPath)
      }
    }
  } catch {
    // skip unreadable directories
  }
  return results
}

/** 递归扫描目录下所有 .md 文件，返回绝对路径列表 */
function findMdFilesRecursive(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findMdFilesRecursive(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  } catch {
    // skip unreadable directories
  }
  return results
}

export async function refreshSkillsFromDisk(): Promise<SkillListItem[]> {
  if (!existsSync(SKILLS_DIR)) return []
  const now = Date.now()
  const files = findMdFilesRecursive(SKILLS_DIR)

  for (const filePath of files) {
    const parsed = parseSkillFile(filePath)
    const relative = path.relative(SKILLS_DIR, filePath)
    const id = path.dirname(relative) === '.'
      ? parsed.id
      : `skill_${workspaceSkillId(SKILLS_DIR, filePath)}`
    const existing = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) })
    if (existing) {
      await db
        .update(schema.skills)
        .set({
          id,
          name: parsed.name,
          description: parsed.description,
          content: parsed.content,
          sourcePath: parsed.sourcePath,
          tags: parsed.tags,
          updatedAt: now,
        })
        .where(eq(schema.skills.id, existing.id))
    } else {
      await db.insert(schema.skills).values({
        ...parsed,
        id,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  const rows = await db.query.skills.findMany({ orderBy: [asc(schema.skills.name)] })
  return rows.map(toSkillListItem)
}

interface ParsedMarkdown {
  name: string
  description: string
  content: string | null
  tags: string[]
}

function parseMarkdownWithFrontmatter(raw: string, fallbackName: string): ParsedMarkdown {
  const frontmatter = extractYamlFrontmatter(raw)
  const body = frontmatter ? raw.slice(frontmatter.endIndex).trim() : raw
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const name = frontmatter?.fields.name
    || title?.replace(/^Skill[:：]\s*/, '').trim()
    || fallbackName
  const description = frontmatter?.fields.description
    || extractParagraph(body)
    || 'Skill'
  const tags = frontmatter?.fields.tags
    ?? inferTags(fallbackName, body)
  const content = body || null
  return { name, description: description.slice(0, MAX_DESCRIPTION_CHARS), content, tags }
}

interface YamlFrontmatter {
  fields: { name?: string; description?: string; tags?: string[] }
  endIndex: number
}

function extractYamlFrontmatter(text: string): YamlFrontmatter | null {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const raw = match[1] ?? ''
  const fields: YamlFrontmatter['fields'] = {}
  for (const line of raw.split(/\r?\n/)) {
    const keyVal = line.match(/^([a-z_-]+):\s*(.*)/i)
    if (!keyVal) continue
    const key = (keyVal[1] ?? '').trim().toLowerCase()
    const val = (keyVal[2] ?? '').trim()
    if (key === 'name') fields.name = val
    else if (key === 'description') fields.description = val
    else if (key === 'tags') fields.tags = val.split(/[,\s]+/).filter(Boolean)
  }
  return { fields, endIndex: (match[0]?.length ?? 0) }
}

function extractParagraph(body: string): string {
  const blockquote = body.match(/^>\s*(.+)$/m)?.[1]?.trim()
  if (blockquote) return blockquote

  const paragraph = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('---'))
  return paragraph || ''
}

export function parseSkillFile(filePath: string): Omit<SkillListItem, 'enabled' | 'createdAt' | 'updatedAt'> {
  const resolved = path.resolve(filePath)
  const relative = path.relative(SKILLS_DIR, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Skill path must be inside skills directory: ${filePath}`)
  }

  const raw = readFileSync(resolved, 'utf8')
  const baseName = path.basename(resolved, '.md')
  const parsed = parseMarkdownWithFrontmatter(raw, baseName)

  return {
    id: `skill_${baseName.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    sourcePath: resolved,
    tags: parsed.tags,
  }
}

function workspaceSkillId(workspaceRootPath: string, filePath: string): string {
  const relative = path.relative(workspaceRootPath, filePath).replace(/\\/g, '/')
  const label = relative.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  const hash = createHash('sha1').update(relative).digest('hex').slice(0, 10)
  return `${label || 'skill'}_${hash}`
}

function inferTags(baseName: string, content: string): string[] {
  const tags = new Set<string>()
  for (const part of baseName.split(/[-_]/)) {
    if (part) tags.add(part)
  }
  if (/adapter/i.test(content)) tags.add('adapter')
  if (/tool|工具/i.test(content)) tags.add('tool')
  if (/artifact|产物/i.test(content)) tags.add('artifact')
  if (/message/i.test(content)) tags.add('message')
  return [...tags]
}

function toSkillListItem(row: typeof schema.skills.$inferSelect): SkillListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    sourcePath: row.sourcePath,
    tags: row.tags,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
