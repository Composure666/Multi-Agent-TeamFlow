import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'

import { buildWebAppHtml } from '@/lib/artifact-preview'
import type { ArtifactContent, DeployStatusRecord } from '@/shared/types'

import { isPathWithin } from './workspace-utils'

const DEPLOYMENT_ID_RE = /^dep_[0-9A-Za-z]+$/
const PRIVATE_DIR = '.agenthub'
const MANIFEST_PATH = `${PRIVATE_DIR}/manifest.json`
const SOURCE_ROOT = `${PRIVATE_DIR}/source`
const RUNTIME_ENTRY = 'index.html'
const DEPLOYMENT_SUMMARY_INSTRUCTION =
  'User-facing summaries must not invent a hostname or public URL for this deployment. The previewPath is a local relative path for the current AgentHub instance; tell the user to use the deployment card buttons, or quote previewPath exactly.'

export interface DeploymentManifest {
  id: string
  artifactId: string
  title: string
  version: number
  deploymentType: 'local_static'
  createdAt: number
  sourceEntry: string
  runtimeEntry: string
  sourceFiles: string[]
  sourceType?: 'artifact' | 'workspace'
  workspacePath?: string
}

interface DeploymentOptions {
  dataDir?: string
}

export interface StaticPublishTarget {
  publishDir: string
  publicBaseUrl: string
}

export interface StaticPublishResult {
  publicUrl: string
  publishPath: string
  localPreviewPath: string
  publishTargetType: 'static_directory'
}

interface CreateLocalStaticDeploymentArgs extends DeploymentOptions {
  id: string
  artifactId: string
  title: string
  version: number
  content: Extract<ArtifactContent, { type: 'web_app' }>
  createdAt?: number
}

interface CreateWorkspaceStaticDeploymentArgs extends DeploymentOptions {
  id: string
  title: string
  sourceDir: string
  workspacePath: string
  entry?: string
  createdAt?: number
}

export type DeploymentAssetResult =
  | {
      ok: true
      body: ArrayBuffer
      contentType: string
      headers: Record<string, string>
    }
  | { ok: false; status: 400 | 404; error: string }

export interface DeploymentDownload {
  body: ArrayBuffer
  fileName: string
  contentType: string
}

export function createLocalStaticDeployment(
  args: CreateLocalStaticDeploymentArgs,
): DeployStatusRecord {
  assertDeploymentId(args.id)

  const dataDir = getAgentHubDataDir(args)
  const deploymentsRoot = getDeploymentsRoot({ dataDir })
  const deploymentDir = getDeploymentDir(args.id, { dataDir })
  if (existsSync(deploymentDir)) {
    throw new Error(`Deployment already exists: ${args.id}`)
  }

  const createdAt = args.createdAt ?? Date.now()
  const files = normalizeWebAppFiles(args.content.files)
  const sourceEntry = resolveSourceEntry(args.content.entry, files)
  const sourceFiles = [...files.keys()].sort()
  const manifest: DeploymentManifest = {
    id: args.id,
    artifactId: args.artifactId,
    title: args.title,
    version: args.version,
    deploymentType: 'local_static',
    createdAt,
    sourceEntry,
    runtimeEntry: RUNTIME_ENTRY,
    sourceFiles,
    sourceType: 'artifact',
  }

  try {
    mkdirSync(deploymentDir, { recursive: true })

    for (const [name, body] of files) {
      writeTextFileWithin(deploymentDir, path.posix.join(SOURCE_ROOT, name), body)
      writeTextFileWithin(deploymentDir, name, body)
    }

    const runtimeHtml = buildWebAppHtml({
      type: 'web_app',
      files: Object.fromEntries(files),
      entry: sourceEntry,
    })
    writeTextFileWithin(deploymentDir, RUNTIME_ENTRY, runtimeHtml)
    writeTextFileWithin(deploymentDir, MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  } catch (error) {
    cleanupPartialDeployment(deploymentDir, deploymentsRoot)
    throw error
  }

  return {
    id: args.id,
    artifactId: args.artifactId,
    title: args.title,
    version: args.version,
    previewPath: deploymentPreviewPath(args.id),
    deploymentType: 'local_static',
    deploymentPath: deploymentPreviewPath(args.id),
    sourceDownloadPath: deploymentDownloadPath(args.id, 'source'),
    containerDownloadPath: deploymentDownloadPath(args.id, 'container'),
    summaryInstruction: DEPLOYMENT_SUMMARY_INSTRUCTION,
    status: 'ready',
    createdAt,
    sourceType: 'artifact',
  }
}

export function createWorkspaceStaticDeployment(
  args: CreateWorkspaceStaticDeploymentArgs,
): DeployStatusRecord {
  assertDeploymentId(args.id)

  const sourceStat = statSync(args.sourceDir, { throwIfNoEntry: false })
  if (!sourceStat?.isDirectory()) {
    throw new Error(`Workspace deployment source is not a directory: ${args.workspacePath}`)
  }

  const dataDir = getAgentHubDataDir(args)
  const deploymentsRoot = getDeploymentsRoot({ dataDir })
  const deploymentDir = getDeploymentDir(args.id, { dataDir })
  if (existsSync(deploymentDir)) {
    throw new Error(`Deployment already exists: ${args.id}`)
  }

  const createdAt = args.createdAt ?? Date.now()
  const sourceFiles = listWorkspaceStaticFiles(args.sourceDir)
  const sourceEntry = resolveWorkspaceEntry(args.entry, sourceFiles)
  const manifest: DeploymentManifest = {
    id: args.id,
    artifactId: `workspace:${args.workspacePath}`,
    title: args.title,
    version: 0,
    deploymentType: 'local_static',
    createdAt,
    sourceEntry,
    runtimeEntry: RUNTIME_ENTRY,
    sourceFiles,
    sourceType: 'workspace',
    workspacePath: args.workspacePath,
  }

  try {
    mkdirSync(deploymentDir, { recursive: true })

    for (const file of sourceFiles) {
      const source = path.join(args.sourceDir, ...file.split('/'))
      const body = readFileSync(source)
      writeBinaryFileWithin(deploymentDir, path.posix.join(SOURCE_ROOT, file), body)
      writeBinaryFileWithin(deploymentDir, file, body)
    }

    if (sourceEntry !== RUNTIME_ENTRY) {
      const runtimeHtml = readFileSync(path.join(args.sourceDir, ...sourceEntry.split('/')))
      writeBinaryFileWithin(deploymentDir, RUNTIME_ENTRY, runtimeHtml)
    }
    writeTextFileWithin(deploymentDir, MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  } catch (error) {
    cleanupPartialDeployment(deploymentDir, deploymentsRoot)
    throw error
  }

  return {
    id: args.id,
    artifactId: manifest.artifactId,
    title: args.title,
    version: 0,
    previewPath: deploymentPreviewPath(args.id),
    deploymentType: 'local_static',
    deploymentPath: deploymentPreviewPath(args.id),
    sourceDownloadPath: deploymentDownloadPath(args.id, 'source'),
    containerDownloadPath: deploymentDownloadPath(args.id, 'container'),
    summaryInstruction: DEPLOYMENT_SUMMARY_INSTRUCTION,
    status: 'ready',
    createdAt,
    sourceType: 'workspace',
    workspacePath: args.workspacePath,
  }
}

export function deploymentPreviewPath(deploymentId: string): string {
  return `/deployments/${encodeURIComponent(deploymentId)}`
}

export function deploymentDownloadPath(
  deploymentId: string,
  kind: 'source' | 'container',
): string {
  return `/api/deployments/${encodeURIComponent(deploymentId)}/download/${kind}`
}

export function publishDeploymentToStaticDirectory(
  deploymentId: string,
  target: StaticPublishTarget,
  options: DeploymentOptions = {},
): StaticPublishResult {
  const manifest = readDeploymentManifest(deploymentId, options)
  if (!manifest) {
    throw new Error(`Deployment not found: ${deploymentId}`)
  }

  const publishRoot = normalizePublishRoot(target.publishDir)
  const publishDir = path.join(publishRoot, deploymentId)
  if (!isPathWithin(publishDir, publishRoot)) {
    throw new Error(`Publish path escapes configured directory: ${publishDir}`)
  }

  const deploymentDir = getDeploymentDir(deploymentId, options)
  rmSync(publishDir, { recursive: true, force: true })
  mkdirSync(publishDir, { recursive: true })

  for (const file of listPublicDeploymentFiles(deploymentDir)) {
    const source = safeJoinDeploymentPath(deploymentDir, file)
    const dest = path.join(publishDir, ...file.split('/'))
    if (!isPathWithin(dest, publishDir)) {
      throw new Error(`Publish file path escapes deployment directory: ${file}`)
    }
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(source))
  }

  return {
    publicUrl: publicDeploymentUrl(target.publicBaseUrl, deploymentId),
    publishPath: publishDir,
    localPreviewPath: deploymentPreviewPath(deploymentId),
    publishTargetType: 'static_directory',
  }
}

export function readDeploymentAsset(
  deploymentId: string,
  pathParts: string[] | undefined,
  options: DeploymentOptions = {},
): DeploymentAssetResult {
  if (!isDeploymentId(deploymentId)) {
    return { ok: false, status: 404, error: 'Deployment not found' }
  }

  const manifest = readDeploymentManifest(deploymentId, options)
  if (!manifest) {
    return { ok: false, status: 404, error: 'Deployment not found' }
  }

  const requested = pathParts && pathParts.length > 0 ? pathParts.join('/') : manifest.runtimeEntry
  const rawRequested = requested.trim().replace(/\\/g, '/')
  const normalizedRequested = path.posix.normalize(rawRequested)
  if (normalizedRequested === PRIVATE_DIR || normalizedRequested.startsWith(`${PRIVATE_DIR}/`)) {
    return { ok: false, status: 404, error: 'Deployment asset not found' }
  }
  const relativePath = normalizeDeploymentFilePath(requested)
  if (!relativePath) {
    return { ok: false, status: 400, error: 'Invalid deployment path' }
  }

  const deploymentDir = getDeploymentDir(deploymentId, options)
  const absPath = safeJoinDeploymentPath(deploymentDir, relativePath)
  if (!existsSync(absPath)) {
    return { ok: false, status: 404, error: 'Deployment asset not found' }
  }
  const stat = statSync(absPath)
  if (!stat.isFile()) {
    return { ok: false, status: 404, error: 'Deployment asset not found' }
  }

  const contentType = contentTypeFor(relativePath)
  return {
    ok: true,
    body: toArrayBuffer(readFileSync(absPath)),
    contentType,
    headers: responseHeadersFor(contentType),
  }
}

export async function buildDeploymentSourceZip(
  deploymentId: string,
  options: DeploymentOptions = {},
): Promise<DeploymentDownload | null> {
  const manifest = readDeploymentManifest(deploymentId, options)
  if (!manifest) return null

  const deploymentDir = getDeploymentDir(deploymentId, options)
  const zip = new JSZip()
  for (const file of manifest.sourceFiles) {
    const absPath = safeJoinDeploymentPath(deploymentDir, path.posix.join(SOURCE_ROOT, file))
    if (existsSync(absPath) && statSync(absPath).isFile()) {
      zip.file(file, readFileSync(absPath))
    }
  }
  zip.file('README.txt', sourceReadme(manifest))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return {
    body: toArrayBuffer(buf),
    fileName: `${downloadBaseName(manifest)}-source.zip`,
    contentType: 'application/zip',
  }
}

export async function buildDeploymentContainerZip(
  deploymentId: string,
  options: DeploymentOptions = {},
): Promise<DeploymentDownload | null> {
  const manifest = readDeploymentManifest(deploymentId, options)
  if (!manifest) return null

  const deploymentDir = getDeploymentDir(deploymentId, options)
  const zip = new JSZip()
  for (const file of listPublicDeploymentFiles(deploymentDir)) {
    const absPath = safeJoinDeploymentPath(deploymentDir, file)
    zip.file(path.posix.join('app', file), readFileSync(absPath))
  }
  zip.file('Dockerfile', dockerfile())
  zip.file('nginx.conf', nginxConf())
  zip.file('README.txt', containerReadme(manifest))

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return {
    body: toArrayBuffer(buf),
    fileName: `${downloadBaseName(manifest)}-container.zip`,
    contentType: 'application/zip',
  }
}

export function readDeploymentManifest(
  deploymentId: string,
  options: DeploymentOptions = {},
): DeploymentManifest | null {
  if (!isDeploymentId(deploymentId)) return null
  const manifestPath = safeJoinDeploymentPath(getDeploymentDir(deploymentId, options), MANIFEST_PATH)
  if (!existsSync(manifestPath)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return isDeploymentManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function normalizeDeploymentFilePath(filePath: string): string | null {
  if (filePath.includes('\0')) return null
  const raw = filePath.trim().replace(/\\/g, '/')
  if (!raw) return null
  if (raw.startsWith('/') || raw.startsWith('//') || /^[A-Za-z]:/.test(raw)) return null
  if (raw.split('/').some((segment) => !segment || segment === '..')) return null

  const normalized = path.posix.normalize(raw)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    return null
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null
  }
  if (segments[0]?.toLowerCase() === PRIVATE_DIR) return null
  return normalized
}

export function isDeploymentId(value: string): boolean {
  return DEPLOYMENT_ID_RE.test(value)
}

function assertDeploymentId(value: string): void {
  if (!isDeploymentId(value)) throw new Error(`Invalid deployment id: ${value}`)
}

function getAgentHubDataDir(options: DeploymentOptions = {}): string {
  return (
    options.dataDir ??
    process.env.AGENTHUB_DATA_DIR ??
    path.resolve(/* turbopackIgnore: true */ process.cwd(), '.agenthub-data')
  )
}

function getDeploymentsRoot(options: DeploymentOptions = {}): string {
  return path.join(getAgentHubDataDir(options), 'deployments')
}

function getDeploymentDir(deploymentId: string, options: DeploymentOptions = {}): string {
  assertDeploymentId(deploymentId)
  return path.join(getDeploymentsRoot(options), deploymentId)
}

function normalizeWebAppFiles(files: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [name, body] of Object.entries(files)) {
    const normalized = normalizeDeploymentFilePath(name)
    if (!normalized) {
      throw new Error(`Unsafe web app file path: ${name}`)
    }
    if (out.has(normalized)) {
      throw new Error(`Duplicate web app file path after normalization: ${name}`)
    }
    out.set(normalized, body)
  }
  if (out.size === 0) throw new Error('Web app artifact has no deployable files')
  return out
}

function resolveSourceEntry(entry: string, files: Map<string, string>): string {
  const normalizedEntry = normalizeDeploymentFilePath(entry)
  if (!normalizedEntry) throw new Error(`Unsafe web app entry path: ${entry}`)
  if (normalizedEntry && files.has(normalizedEntry)) return normalizedEntry
  if (files.has('index.html')) return 'index.html'
  const firstHtml = [...files.keys()].find((name) => name.toLowerCase().endsWith('.html'))
  if (firstHtml) return firstHtml
  throw new Error(`Web app entry file not found: ${entry}`)
}

function writeTextFileWithin(root: string, relativePath: string, body: string): void {
  const absPath = safeJoinDeploymentPath(root, relativePath)
  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(absPath, body, 'utf8')
}

function writeBinaryFileWithin(root: string, relativePath: string, body: Buffer): void {
  const absPath = safeJoinDeploymentPath(root, relativePath)
  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(absPath, body)
}

function safeJoinDeploymentPath(root: string, relativePath: string): string {
  const normalized = normalizeDeploymentFilePath(relativePath)
  if (!normalized && relativePath !== MANIFEST_PATH && !relativePath.startsWith(`${SOURCE_ROOT}/`)) {
    throw new Error(`Invalid deployment file path: ${relativePath}`)
  }
  const parts = relativePath.replace(/\\/g, '/').split('/')
  const absPath = path.resolve(root, ...parts)
  if (!isPathWithin(absPath, root)) {
    throw new Error(`Deployment path escapes root: ${relativePath}`)
  }
  return absPath
}

function cleanupPartialDeployment(deploymentDir: string, deploymentsRoot: string): void {
  if (isPathWithin(deploymentDir, deploymentsRoot)) {
    rmSync(deploymentDir, { recursive: true, force: true })
  }
}

function listPublicDeploymentFiles(root: string, relativeDir = ''): string[] {
  const absDir = relativeDir ? safeJoinDeploymentPath(root, relativeDir) : root
  const out: string[] = []
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === PRIVATE_DIR) continue
    const rel = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name
    if (entry.isDirectory()) {
      out.push(...listPublicDeploymentFiles(root, rel))
    } else if (entry.isFile()) {
      out.push(rel)
    }
  }
  return out.sort()
}

const WORKSPACE_DEPLOY_MAX_FILES = 2000
const WORKSPACE_DEPLOY_MAX_BYTES = 100 * 1024 * 1024
const WORKSPACE_DEPLOY_IGNORED_DIRS = new Set(['.agenthub', '.git', 'node_modules'])

function listWorkspaceStaticFiles(sourceDir: string, relativeDir = '', acc = { files: 0, bytes: 0 }): string[] {
  const absDir = relativeDir ? path.join(sourceDir, ...relativeDir.split('/')) : sourceDir
  const out: string[] = []
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue
    if (entry.isDirectory() && WORKSPACE_DEPLOY_IGNORED_DIRS.has(entry.name)) continue
    const rel = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name
    const normalized = normalizeDeploymentFilePath(rel)
    if (!normalized) continue
    const absPath = path.join(sourceDir, ...normalized.split('/'))
    if (entry.isDirectory()) {
      out.push(...listWorkspaceStaticFiles(sourceDir, normalized, acc))
      continue
    }
    if (!entry.isFile()) continue
    const size = statSync(absPath).size
    acc.files += 1
    acc.bytes += size
    if (acc.files > WORKSPACE_DEPLOY_MAX_FILES) {
      throw new Error(`Workspace deployment has too many files (>${WORKSPACE_DEPLOY_MAX_FILES})`)
    }
    if (acc.bytes > WORKSPACE_DEPLOY_MAX_BYTES) {
      throw new Error(`Workspace deployment is too large (>${Math.round(WORKSPACE_DEPLOY_MAX_BYTES / 1024 / 1024)}MB)`)
    }
    out.push(normalized)
  }
  return out.sort()
}

function resolveWorkspaceEntry(entry: string | undefined, files: string[]): string {
  const raw = entry?.trim() || RUNTIME_ENTRY
  const normalized = normalizeDeploymentFilePath(raw)
  if (!normalized) throw new Error(`Unsafe workspace deployment entry path: ${raw}`)
  if (!files.includes(normalized)) {
    throw new Error(`Workspace deployment entry not found: ${normalized}`)
  }
  if (!normalized.toLowerCase().endsWith('.html')) {
    throw new Error(`Workspace deployment entry must be an HTML file: ${normalized}`)
  }
  return normalized
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.txt':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function responseHeadersFor(contentType: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  }
  if (contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = [
      'sandbox allow-scripts',
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: http: https:",
      "font-src 'self' data:",
      "connect-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join('; ')
  } else if (contentType === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "sandbox; default-src 'none'"
  }
  return headers
}

function sourceReadme(manifest: DeploymentManifest): string {
  if (manifest.sourceType === 'workspace') {
    return [
      `Workspace deployment: ${manifest.title}`,
      `Source path: ${manifest.workspacePath ?? '(unknown)'}`,
      `Deployment: ${manifest.id}`,
      `Entry: ${manifest.sourceEntry}`,
      '',
      'This ZIP contains files copied from a workspace static output directory.',
      `Generated at: ${new Date(manifest.createdAt).toISOString()}`,
      '',
    ].join('\n')
  }
  return [
    `Artifact: ${manifest.title}`,
    `Version: v${manifest.version}`,
    `Deployment: ${manifest.id}`,
    `Entry: ${manifest.sourceEntry}`,
    '',
    'This ZIP contains the original web_app artifact source files.',
    `Generated at: ${new Date(manifest.createdAt).toISOString()}`,
    '',
  ].join('\n')
}

function containerReadme(manifest: DeploymentManifest): string {
  return [
    `${manifest.sourceType === 'workspace' ? 'Workspace deployment' : 'Artifact'}: ${manifest.title}`,
    manifest.sourceType === 'workspace' ? `Source path: ${manifest.workspacePath ?? '(unknown)'}` : `Version: v${manifest.version}`,
    `Deployment: ${manifest.id}`,
    '',
    'Build and run:',
    `  docker build -t agenthub-${manifest.id} .`,
    `  docker run --rm -p 8080:80 agenthub-${manifest.id}`,
    '',
    'Then open http://127.0.0.1:8080/',
    `Generated at: ${new Date(manifest.createdAt).toISOString()}`,
    '',
  ].join('\n')
}

function dockerfile(): string {
  return [
    'FROM nginx:1.27-alpine',
    'COPY app/ /usr/share/nginx/html/',
    'COPY nginx.conf /etc/nginx/conf.d/default.conf',
    'EXPOSE 80',
  ].join('\n') + '\n'
}

function nginxConf(): string {
  return [
    'server {',
    '  listen 80;',
    '  server_name _;',
    '  root /usr/share/nginx/html;',
    '  index index.html;',
    '',
    '  location / {',
    '    try_files $uri $uri/ /index.html;',
    '  }',
    '',
    '  add_header X-Content-Type-Options "nosniff" always;',
    '}',
  ].join('\n') + '\n'
}

function downloadBaseName(manifest: DeploymentManifest): string {
  const safeTitle = manifest.title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .trim()
  return `${safeTitle || 'artifact'}-v${manifest.version}-${manifest.id}`
}

function normalizePublishRoot(publishDir: string): string {
  const trimmed = publishDir.trim()
  if (!trimmed) throw new Error('Deployment publish directory is empty')
  if (!path.isAbsolute(trimmed)) {
    throw new Error('Deployment publish directory must be an absolute path')
  }
  const resolved = path.resolve(trimmed)
  if (resolved === path.parse(resolved).root) {
    throw new Error('Deployment publish directory must not be the filesystem root')
  }
  return resolved
}

function publicDeploymentUrl(baseUrl: string, deploymentId: string): string {
  assertDeploymentId(deploymentId)
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    throw new Error('Deployment public base URL must be a valid absolute URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Deployment public base URL must use http or https')
  }
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  url.pathname = `${basePath}${encodeURIComponent(deploymentId)}/`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function isDeploymentManifest(value: unknown): value is DeploymentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    isDeploymentId(obj.id) &&
    typeof obj.artifactId === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.version === 'number' &&
    obj.deploymentType === 'local_static' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.sourceEntry === 'string' &&
    typeof obj.runtimeEntry === 'string' &&
    Array.isArray(obj.sourceFiles) &&
    obj.sourceFiles.every((item) => typeof item === 'string')
  )
}
