import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { createMcpServer, updateMcpServer } from '@/server/mcp-server-service'

export type GithubToolType = 'all' | 'skill' | 'mcp_server'
export type ExternalToolType = 'skill' | 'mcp_server'
export type ExternalToolSource = 'github'
export type GithubSearchStatus = 'ok' | 'rate_limited' | 'unauthorized' | 'failed'

export interface ExternalToolSearchResult {
  id: string
  name: string
  description: string
  type: ExternalToolType
  kind: ExternalToolType
  source: ExternalToolSource
  githubUrl: string | null
  installUrl: string | null
  manifestUrl: string | null
  tags: string[]
  status: 'remote'
  compatibility: Record<'claude-code' | 'codex' | 'custom' | 'mock', 'supported' | 'unsupported'>
}

export interface SearchGithubToolCatalogInput {
  keyword: string
  type: GithubToolType
  page: number
  pageSize: number
}

export interface SearchGithubToolCatalogOutput {
  results: ExternalToolSearchResult[]
  total: number | null
  nextPage: number | null
  status: GithubSearchStatus
  message?: string
}

export interface ImportGithubToolInput {
  type: ExternalToolType
  remoteId?: string
  installUrl?: string | null
  manifestUrl?: string | null
  githubUrl?: string | null
}

export interface ImportGithubToolOutput {
  id: string
  type: ExternalToolType
  imported: boolean
}

const GITHUB_API = 'https://api.github.com'
const MAX_FETCH_CHARS = 200_000
const DEFAULT_BRANCH = 'main'

const GithubRepository = z.object({
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  default_branch: z.string().nullable().optional(),
})

const GithubCodeItem = z.object({
  name: z.string(),
  path: z.string(),
  html_url: z.string(),
  repository: GithubRepository,
})

const GithubSearchResponse = z.object({
  total_count: z.number().optional(),
  items: z.array(z.unknown()),
})

const GithubSkillManifest = z.object({
  type: z.literal('skill').optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  contentUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
})

const GithubMcpManifest = z.object({
  type: z.literal('mcp_server').optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  trust: z.enum(['ask', 'always']).default('ask'),
  tags: z.array(z.string()).default([]),
  githubUrl: z.string().url().optional(),
})

export async function searchGithubToolCatalog(
  input: SearchGithubToolCatalogInput,
  signal?: AbortSignal,
): Promise<SearchGithubToolCatalogOutput> {
  const keyword = input.keyword.trim()
  if (!keyword) {
    return { results: [], total: 0, nextPage: null, status: 'ok' }
  }

  const searches: Array<Promise<SearchGithubToolCatalogOutput>> = []
  if (input.type === 'all' || input.type === 'skill') {
    searches.push(searchGithubCode(keyword, 'skill', input.page, input.pageSize, signal))
  }
  if (input.type === 'all' || input.type === 'mcp_server') {
    searches.push(searchGithubCode(keyword, 'mcp_server', input.page, input.pageSize, signal))
  }

  const settled = await Promise.all(searches)
  const results = dedupeResults(settled.flatMap((item) => item.results)).slice(0, input.pageSize)
  const failed = settled.find((item) => item.status !== 'ok')
  const status = failed && results.length === 0 ? failed.status : 'ok'
  const message = failed?.message
  const nextPage = results.length >= input.pageSize ? input.page + 1 : null
  const total = settled.some((item) => item.total === null) ? null : settled.reduce((sum, item) => sum + (item.total ?? 0), 0)

  return { results, total, nextPage, status, message }
}

export async function importGithubTool(
  input: ImportGithubToolInput,
  signal?: AbortSignal,
): Promise<ImportGithubToolOutput> {
  if (input.type === 'skill') return importGithubSkill(input, signal)
  return importGithubMcpServer(input, signal)
}

async function searchGithubCode(
  keyword: string,
  type: ExternalToolType,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<SearchGithubToolCatalogOutput> {
  const patterns = type === 'skill'
    ? ['filename:SKILL.md', 'filename:agenthub.skill.json', 'path:.agenthub/skill.json']
    : ['filename:agenthub.mcp.json', 'path:.agenthub/mcp.json']

  const allResults: ExternalToolSearchResult[] = []
  let total = 0
  for (const pattern of patterns) {
    const query = `${keyword} ${pattern}`
    const url = `${GITHUB_API}/search/code?q=${encodeURIComponent(query)}&page=${page}&per_page=${Math.min(pageSize, 50)}`
    const response = await githubFetchJson(url, signal)
    if (response.status === 'unauthorized') break
    if (response.status !== 'ok') return response

    const parsed = GithubSearchResponse.safeParse(response.data)
    if (!parsed.success) {
      return { results: [], total: null, nextPage: null, status: 'failed', message: 'GitHub search response is invalid' }
    }

    total += parsed.data.total_count ?? 0
    for (const rawItem of parsed.data.items) {
      const item = GithubCodeItem.safeParse(rawItem)
      if (!item.success) continue
      allResults.push(toExternalToolSearchResult(type, item.data))
    }
  }

  if (allResults.length > 0) {
    return {
      results: dedupeResults(allResults),
      total,
      nextPage: allResults.length >= pageSize ? page + 1 : null,
      status: 'ok',
    }
  }

  return searchGithubRepositories(keyword, type, page, pageSize, signal)
}

async function searchGithubRepositories(
  keyword: string,
  type: ExternalToolType,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<SearchGithubToolCatalogOutput> {
  const qualifier = type === 'skill' ? 'skill OR skills' : 'mcp server'
  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(`${keyword} ${qualifier}`)}&page=${page}&per_page=${Math.min(pageSize, 50)}`
  const response = await githubFetchJson(url, signal)
  if (response.status !== 'ok') return response

  const parsed = GithubSearchResponse.safeParse(response.data)
  if (!parsed.success) {
    return { results: [], total: null, nextPage: null, status: 'failed', message: 'GitHub repository search response is invalid' }
  }

  const results: ExternalToolSearchResult[] = []
  for (const rawItem of parsed.data.items) {
    const item = GithubRepository.safeParse(rawItem)
    if (item.success) results.push(toRepositoryFallbackResult(type, item.data))
  }

  return {
    results,
    total: parsed.data.total_count ?? null,
    nextPage: results.length >= pageSize ? page + 1 : null,
    status: 'ok',
  }
}

async function githubFetchJson(url: string, signal?: AbortSignal): Promise<SearchGithubToolCatalogOutput & { data?: unknown }> {
  assertAllowedGithubUrl(url)
  const response = await fetch(url, { headers: githubHeaders(), signal })
  if (response.status === 401 || response.status === 403) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining')
    if (rateRemaining === '0') {
      return { results: [], total: null, nextPage: null, status: 'rate_limited', message: 'GitHub API rate limit exceeded' }
    }
    const scopeMessage = response.status === 401 && url.includes('/search/code')
      ? 'GitHub code search requires authentication; falling back to repository search'
      : 'GitHub API request is unauthorized'
    return { results: [], total: null, nextPage: null, status: 'unauthorized', message: scopeMessage }
  }
  if (!response.ok) {
    return { results: [], total: null, nextPage: null, status: 'failed', message: `GitHub API request failed: ${response.status}` }
  }
  return { results: [], total: null, nextPage: null, status: 'ok', data: await response.json() }
}

async function fetchGithubText(url: string, signal?: AbortSignal): Promise<string> {
  assertAllowedGithubUrl(url)
  const response = await fetch(url, { headers: githubHeaders(), signal })
  if (!response.ok) throw new Error(`GitHub fetch failed (${response.status}): ${url}`)
  const text = await response.text()
  if (text.length > MAX_FETCH_CHARS) throw new Error(`GitHub file is too large: ${url}`)
  return text
}

interface SkillImportData {
  name: string
  description: string
  content: string | null
  tags: string[]
}

async function importGithubSkill(input: ImportGithubToolInput, signal?: AbortSignal): Promise<ImportGithubToolOutput> {
  const manifest = input.manifestUrl ? await fetchOptionalSkillManifest(input.manifestUrl, signal) : null
  const installUrl = manifest?.contentUrl ?? input.installUrl
  const fallbackIdSource = input.githubUrl ?? input.manifestUrl ?? input.remoteId ?? installUrl ?? 'github-skill'
  if (!manifest && !installUrl && !input.githubUrl && !input.remoteId) {
    throw new Error('GitHub Skill requires installUrl, manifestUrl, githubUrl, or remoteId')
  }

  const data = manifest
    ? {
        name: manifest.name,
        description: manifest.description,
        content: await tryFetchSkillContent(installUrl, signal),
        tags: manifest.tags,
      }
    : await resolveGithubSkillMarkdown(installUrl, input, signal)

  const id = remoteSkillId(input.remoteId ?? input.manifestUrl ?? input.installUrl ?? data.name)
  const now = Date.now()
  const sourcePath = `github://${input.githubUrl ?? input.installUrl ?? input.manifestUrl ?? fallbackIdSource}`
  const existing = await db.query.skills.findFirst({ where: eq(schema.skills.id, id) })
  const values = {
    id,
    name: data.name,
    description: data.description,
    content: data.content,
    sourcePath,
    tags: data.tags,
    enabled: true,
    updatedAt: now,
  }

  if (existing) {
    await db.update(schema.skills).set(values).where(eq(schema.skills.id, id))
  } else {
    await db.insert(schema.skills).values({ ...values, createdAt: now })
  }

  return { id, type: 'skill', imported: !existing }
}

async function tryFetchSkillContent(installUrl: string | null | undefined, signal?: AbortSignal): Promise<string | null> {
  if (!installUrl) return null
  try {
    const raw = await fetchGithubText(installUrl, signal)
    const frontmatter = extractYamlFrontmatter(raw)
    const body = frontmatter ? raw.slice(frontmatter.endIndex).trim() : raw
    return body || null
  } catch {
    return null
  }
}

async function resolveGithubSkillMarkdown(
  installUrl: string | null | undefined,
  input: ImportGithubToolInput,
  signal?: AbortSignal,
): Promise<SkillImportData> {
  const repoName = extractRepoName(input.githubUrl ?? input.remoteId ?? 'GitHub Skill')

  if (!installUrl) {
    return { name: repoName, description: repoName, content: null, tags: ['github', 'skill'] }
  }

  try {
    const raw = await fetchGithubText(installUrl, signal)
    return parseGitHubSkillMarkdown(raw, repoName)
  } catch (err) {
    if (err instanceof Error && err.message.includes('GitHub fetch failed (404)')) {
      return { name: repoName, description: repoName, content: null, tags: ['github', 'skill'] }
    }
    throw err
  }
}

function extractRepoName(source: string): string {
  const match = source.match(/github\.com\/([^/]+\/[^/]+)/)
  if (match) {
    return match[1]?.split('/').pop() ?? source
  }
  return source.split('/').pop() ?? source
}

function parseGitHubSkillMarkdown(raw: string, fallbackName: string): SkillImportData {
  const frontmatter = extractYamlFrontmatter(raw)
  const body = frontmatter ? raw.slice(frontmatter.endIndex).trim() : raw
  const titleMatch = body.match(/^#\s+(.+)$/m)
  const title = titleMatch?.[1]?.trim()?.replace(/^Skill[:：]\s*/, '').trim()
  const name = frontmatter?.name || title || fallbackName
  const description = frontmatter?.description || extractFirstParagraph(body) || frontmatter?.name || title || fallbackName
  const content = body || null
  const tags = frontmatter?.tags ?? inferGitHubTags(fallbackName, raw)
  return { name, description: description.slice(0, 280), content, tags }
}

interface YamlFrontmatter {
  name?: string
  description?: string
  tags?: string[]
  endIndex: number
}

function extractYamlFrontmatter(text: string): YamlFrontmatter | null {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const raw = match[1] ?? ''
  const fm: YamlFrontmatter = { endIndex: match[0]?.length ?? 0 }
  for (const line of raw.split(/\r?\n/)) {
    const keyVal = line.match(/^([a-z_-]+):\s*(.*)/i)
    if (!keyVal) continue
    const key = (keyVal[1] ?? '').trim().toLowerCase()
    const val = (keyVal[2] ?? '').trim()
    if (key === 'name') fm.name = val
    else if (key === 'description') fm.description = val
    else if (key === 'tags') fm.tags = val.split(/[,\s]+/).filter(Boolean)
  }
  return fm
}

function extractFirstParagraph(body: string): string {
  const blockquote = body.match(/^>\s*(.+)$/m)?.[1]?.trim()
  if (blockquote) return blockquote
  const paragraph = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('```'))
  return paragraph || ''
}

function inferGitHubTags(baseName: string, content: string): string[] {
  const tags = new Set<string>(['github', 'skill'])
  for (const part of baseName.split(/[-_/]/)) {
    if (part) tags.add(part)
  }
  if (/adapter/i.test(content)) tags.add('adapter')
  if (/tool|工具/i.test(content)) tags.add('tool')
  if (/code|编码|编程/i.test(content)) tags.add('code')
  if (/workflow|流程/i.test(content)) tags.add('workflow')
  return [...tags]
}

async function fetchOptionalSkillManifest(url: string, signal?: AbortSignal): Promise<z.infer<typeof GithubSkillManifest> | null> {
  try {
    const raw = await fetchGithubText(url, signal)
    const parsed = GithubSkillManifest.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new Error(`GitHub Skill manifest is invalid: ${url}`)
    return parsed.data
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`GitHub Skill manifest is invalid JSON: ${url}`)
    return null
  }
}

async function importGithubMcpServer(input: ImportGithubToolInput, signal?: AbortSignal): Promise<ImportGithubToolOutput> {
  if (!input.manifestUrl) throw new Error('GitHub MCP server requires manifestUrl')
  const raw = await fetchGithubText(input.manifestUrl, signal)
  const parsed = GithubMcpManifest.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`GitHub MCP manifest is invalid: ${input.manifestUrl}`)

  const name = normalizeMcpName(parsed.data.name)
  const existing = (await db.query.mcpServers.findMany()).find((server) => server.name === name)
  const values = {
    name,
    command: parsed.data.command,
    args: parsed.data.args,
    env: parsed.data.env,
    trust: parsed.data.trust,
    enabled: true,
  }
  const server = existing ? await updateMcpServer(existing.id, values) : await createMcpServer(values)
  return { id: server.id, type: 'mcp_server', imported: !existing }
}

function toExternalToolSearchResult(type: ExternalToolType, item: z.infer<typeof GithubCodeItem>): ExternalToolSearchResult {
  const repo = item.repository
  const branch = repo.default_branch || DEFAULT_BRANCH
  const installUrl = toRawGithubUrl(repo.full_name, branch, item.path)
  const manifestUrl = type === 'skill'
    ? maybeSkillManifestUrl(repo.full_name, branch, item.path)
    : installUrl
  return {
    id: `github:${type}:${repo.full_name}:${item.path}`,
    name: titleFromPath(item.path, repo.name),
    description: repo.description ?? `${repo.full_name} GitHub ${type === 'skill' ? 'Skill' : 'MCP server'}`,
    type,
    kind: type,
    source: 'github',
    githubUrl: item.html_url,
    installUrl: type === 'skill' ? installUrl : repo.html_url,
    manifestUrl,
    tags: type === 'skill' ? ['github', 'skill'] : ['github', 'mcp'],
    status: 'remote',
    compatibility: compatibilityFor(type, type === 'mcp_server' ? 'ask' : undefined),
  }
}

function toRepositoryFallbackResult(type: ExternalToolType, repo: z.infer<typeof GithubRepository>): ExternalToolSearchResult {
  const branch = repo.default_branch || DEFAULT_BRANCH
  const manifestPath = type === 'skill' ? 'agenthub.skill.json' : '.agenthub/mcp.json'
  return {
    id: `github:${type}:${repo.full_name}:${manifestPath}`,
    name: repo.name,
    description: repo.description ?? `${repo.full_name} GitHub ${type === 'skill' ? 'Skill' : 'MCP server'}`,
    type,
    kind: type,
    source: 'github',
    githubUrl: repo.html_url,
    installUrl: type === 'skill' ? toRawGithubUrl(repo.full_name, branch, 'SKILL.md') : `${repo.html_url}#install`,
    manifestUrl: toRawGithubUrl(repo.full_name, branch, manifestPath),
    tags: type === 'skill' ? ['github', 'skill'] : ['github', 'mcp'],
    status: 'remote',
    compatibility: compatibilityFor(type, type === 'mcp_server' ? 'ask' : undefined),
  }
}


function maybeSkillManifestUrl(repo: string, branch: string, skillPath: string): string | null {
  const lower = skillPath.toLowerCase()
  if (lower.endsWith('.json')) return toRawGithubUrl(repo, branch, skillPath)
  const slash = skillPath.lastIndexOf('/')
  const prefix = slash >= 0 ? `${skillPath.slice(0, slash)}/` : ''
  return toRawGithubUrl(repo, branch, `${prefix}agenthub.skill.json`)
}

function toRawGithubUrl(repo: string, branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`
}

function titleFromPath(filePath: string, fallback: string): string {
  const parts = filePath.split('/').filter(Boolean)
  const leaf = parts.at(-2) && parts.at(-1)?.toLowerCase() === 'skill.md' ? parts.at(-2)! : parts.at(-1) ?? fallback
  return leaf.replace(/\.(md|json)$/i, '').replace(/[-_]+/g, ' ')
}

function compatibilityFor(
  type: ExternalToolType,
  trust?: 'ask' | 'always',
): ExternalToolSearchResult['compatibility'] {
  if (type === 'skill') {
    return { 'claude-code': 'supported', codex: 'supported', custom: 'supported', mock: 'supported' }
  }
  return {
    'claude-code': 'supported',
    codex: trust === 'always' ? 'supported' : 'unsupported',
    custom: 'unsupported',
    mock: 'unsupported',
  }
}

function normalizeMcpName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  return normalized && normalized !== 'agenthub' ? normalized : `github_mcp_${Date.now()}`
}

function remoteSkillId(value: string): string {
  return `skill_github_${hashString(value)}`
}

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function dedupeResults(results: ExternalToolSearchResult[]): ExternalToolSearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = result.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function assertAllowedGithubUrl(input: string): URL {
  const url = new URL(input)
  if (url.protocol !== 'https:') throw new Error(`GitHub URL must use HTTPS: ${input}`)
  if (url.username || url.password) throw new Error(`GitHub URL cannot include credentials: ${input}`)
  if (!['github.com', 'raw.githubusercontent.com', 'api.github.com'].includes(url.hostname)) {
    throw new Error(`Only GitHub URLs are supported: ${input}`)
  }
  return url
}

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AgentHub',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
