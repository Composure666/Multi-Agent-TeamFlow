import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'

import type { ArtifactContent } from '@/shared/types'

import {
  buildDeploymentContainerZip,
  buildDeploymentSourceZip,
  createLocalStaticDeployment,
  createWorkspaceStaticDeployment,
  publishDeploymentToStaticDirectory,
  readDeploymentAsset,
} from './deployment-service'

const webAppContent: Extract<ArtifactContent, { type: 'web_app' }> = {
  type: 'web_app',
  files: {
    'index.html': '<main id="app">hello</main>',
    'style.css': 'body { color: red; }',
    'script.js': 'document.body.dataset.ready = "1"',
  },
  entry: 'index.html',
}

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('deployment-service', () => {
  it('materializes a web app deployment with stable paths and private source files', () => {
    const dataDir = tempDataDir()

    const record = createLocalStaticDeployment({
      id: 'dep_test123',
      artifactId: 'art_test123',
      title: 'Demo App',
      version: 2,
      content: webAppContent,
      createdAt: 123,
      dataDir,
    })

    expect(record).toMatchObject({
      id: 'dep_test123',
      artifactId: 'art_test123',
      previewPath: '/deployments/dep_test123',
      deploymentType: 'local_static',
      sourceDownloadPath: '/api/deployments/dep_test123/download/source',
      containerDownloadPath: '/api/deployments/dep_test123/download/container',
      status: 'ready',
      createdAt: 123,
    })
    expect(record.summaryInstruction).toContain('must not invent a hostname')

    const deploymentDir = path.join(dataDir, 'deployments', 'dep_test123')
    const runtimeHtml = readFileSync(path.join(deploymentDir, 'index.html'), 'utf8')
    expect(runtimeHtml).toContain('<style>')
    expect(runtimeHtml).toContain('body { color: red; }')
    expect(runtimeHtml).toContain('document.body.dataset.ready')
    expect(readFileSync(path.join(deploymentDir, '.agenthub', 'source', 'index.html'), 'utf8'))
      .toBe(webAppContent.files['index.html'])

    const manifest = JSON.parse(
      readFileSync(path.join(deploymentDir, '.agenthub', 'manifest.json'), 'utf8'),
    ) as { sourceFiles: string[]; sourceEntry: string }
    expect(manifest.sourceEntry).toBe('index.html')
    expect(manifest.sourceFiles).toEqual(['index.html', 'script.js', 'style.css'])
  })

  it('serves public deployment assets and refuses private or escaping paths', () => {
    const dataDir = tempDataDir()
    createLocalStaticDeployment({
      id: 'dep_assets123',
      artifactId: 'art_assets123',
      title: 'Assets',
      version: 1,
      content: webAppContent,
      dataDir,
    })

    const asset = readDeploymentAsset('dep_assets123', undefined, { dataDir })
    expect(asset.ok).toBe(true)
    if (!asset.ok) throw new Error(asset.error)
    expect(asset.contentType).toBe('text/html; charset=utf-8')
    expect(new TextDecoder().decode(asset.body)).toContain('<main id="app">hello</main>')

    expect(readDeploymentAsset('dep_assets123', ['.agenthub', 'manifest.json'], { dataDir }))
      .toMatchObject({ ok: false, status: 404 })
    expect(readDeploymentAsset('dep_assets123', ['..', 'secret.txt'], { dataDir }))
      .toMatchObject({ ok: false, status: 400 })
    expect(readDeploymentAsset('dep_assets123', ['assets', '..', 'index.html'], { dataDir }))
      .toMatchObject({ ok: false, status: 400 })
  })

  it('rejects unsafe source file paths before writing outside the deployment root', () => {
    const dataDir = tempDataDir()

    const unsafeContent = {
      type: 'web_app' as const,
      files: { '../escape.txt': 'nope', 'index.html': '<h1>x</h1>' },
      entry: 'index.html',
    }

    expect(() =>
      createLocalStaticDeployment({
        id: 'dep_unsafe123',
        artifactId: 'art_unsafe123',
        title: 'Unsafe',
        version: 1,
        content: unsafeContent,
        dataDir,
      }),
    ).toThrow('Unsafe web app file path: ../escape.txt')
    expect(() =>
      createLocalStaticDeployment({
        id: 'dep_unsafe456',
        artifactId: 'art_unsafe456',
        title: 'Unsafe',
        version: 1,
        content: {
          ...unsafeContent,
          files: { 'assets/../escape.txt': 'nope', 'index.html': '<h1>x</h1>' },
        },
        dataDir,
      }),
    ).toThrow('Unsafe web app file path: assets/../escape.txt')
    expect(existsSync(path.join(dataDir, 'escape.txt'))).toBe(false)
  })

  it('builds source and container packages from the materialized deployment', async () => {
    const dataDir = tempDataDir()
    createLocalStaticDeployment({
      id: 'dep_pkg123',
      artifactId: 'art_pkg123',
      title: 'Package Demo',
      version: 3,
      content: webAppContent,
      dataDir,
    })

    const source = await buildDeploymentSourceZip('dep_pkg123', { dataDir })
    expect(source).not.toBeNull()
    if (!source) throw new Error('source zip missing')
    const sourceZip = await JSZip.loadAsync(source.body)
    expect(await sourceZip.file('index.html')?.async('string')).toBe(webAppContent.files['index.html'])
    expect(await sourceZip.file('README.txt')?.async('string')).toContain('Package Demo')

    const container = await buildDeploymentContainerZip('dep_pkg123', { dataDir })
    expect(container).not.toBeNull()
    if (!container) throw new Error('container zip missing')
    const containerZip = await JSZip.loadAsync(container.body)
    expect(await containerZip.file('Dockerfile')?.async('string')).toContain('FROM nginx')
    expect(await containerZip.file('nginx.conf')?.async('string')).toContain('try_files')
    expect(await containerZip.file('app/index.html')?.async('string')).toContain('body { color: red; }')
  })

  it('materializes a workspace static directory deployment', async () => {
    const dataDir = tempDataDir()
    const workspaceDir = tempDataDir()
    const sourceDir = path.join(workspaceDir, 'dist')
    mkdirSync(path.join(sourceDir, 'assets'), { recursive: true })
    mkdirSync(path.join(sourceDir, '.git'), { recursive: true })
    writeFileSync(path.join(sourceDir, 'index.html'), '<main>workspace</main>', 'utf8')
    writeFileSync(path.join(sourceDir, 'assets', 'app.js'), 'document.body.dataset.app = "1"', 'utf8')
    writeFileSync(path.join(sourceDir, '.git', 'config'), 'private', 'utf8')

    const record = createWorkspaceStaticDeployment({
      id: 'dep_workspace123',
      title: 'Workspace Build',
      sourceDir,
      workspacePath: 'dist',
      createdAt: 456,
      dataDir,
    })

    expect(record).toMatchObject({
      id: 'dep_workspace123',
      artifactId: 'workspace:dist',
      title: 'Workspace Build',
      version: 0,
      previewPath: '/deployments/dep_workspace123',
      deploymentType: 'local_static',
      sourceType: 'workspace',
      workspacePath: 'dist',
      status: 'ready',
      createdAt: 456,
    })

    const deploymentDir = path.join(dataDir, 'deployments', 'dep_workspace123')
    expect(readFileSync(path.join(deploymentDir, 'index.html'), 'utf8')).toContain('workspace')
    expect(readFileSync(path.join(deploymentDir, 'assets', 'app.js'), 'utf8')).toContain('dataset.app')
    expect(existsSync(path.join(deploymentDir, '.git'))).toBe(false)

    const source = await buildDeploymentSourceZip('dep_workspace123', { dataDir })
    expect(source).not.toBeNull()
    if (!source) throw new Error('source zip missing')
    const sourceZip = await JSZip.loadAsync(source.body)
    expect(await sourceZip.file('index.html')?.async('string')).toContain('workspace')
    expect(sourceZip.file('.git/config')).toBeNull()
    expect(await sourceZip.file('README.txt')?.async('string')).toContain('Source path: dist')
  })

  it('publishes public deployment files to a configured static directory', () => {
    const dataDir = tempDataDir()
    const publishDir = tempDataDir()
    createLocalStaticDeployment({
      id: 'dep_publish123',
      artifactId: 'art_publish123',
      title: 'Published Demo',
      version: 1,
      content: webAppContent,
      dataDir,
    })

    const result = publishDeploymentToStaticDirectory(
      'dep_publish123',
      {
        publishDir,
        publicBaseUrl: 'https://example.com/apps',
      },
      { dataDir },
    )

    expect(result).toEqual({
      publicUrl: 'https://example.com/apps/dep_publish123/',
      publishPath: path.join(publishDir, 'dep_publish123'),
      localPreviewPath: '/deployments/dep_publish123',
      publishTargetType: 'static_directory',
    })
    expect(readFileSync(path.join(publishDir, 'dep_publish123', 'index.html'), 'utf8'))
      .toContain('<main id="app">hello</main>')
    expect(existsSync(path.join(publishDir, 'dep_publish123', '.agenthub'))).toBe(false)
  })

  it('rejects unsafe publish target settings', () => {
    const dataDir = tempDataDir()
    createLocalStaticDeployment({
      id: 'dep_publish456',
      artifactId: 'art_publish456',
      title: 'Published Demo',
      version: 1,
      content: webAppContent,
      dataDir,
    })

    expect(() =>
      publishDeploymentToStaticDirectory(
        'dep_publish456',
        { publishDir: 'relative/out', publicBaseUrl: 'https://example.com' },
        { dataDir },
      ),
    ).toThrow('must be an absolute path')

    expect(() =>
      publishDeploymentToStaticDirectory(
        'dep_publish456',
        { publishDir: path.parse(path.resolve(dataDir)).root, publicBaseUrl: 'https://example.com' },
        { dataDir },
      ),
    ).toThrow('must not be the filesystem root')

    expect(() =>
      publishDeploymentToStaticDirectory(
        'dep_publish456',
        { publishDir: tempDataDir(), publicBaseUrl: 'file:///tmp/site' },
        { dataDir },
      ),
    ).toThrow('must use http or https')
  })
})

function tempDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-deploy-'))
  tempDirs.push(dir)
  return dir
}
