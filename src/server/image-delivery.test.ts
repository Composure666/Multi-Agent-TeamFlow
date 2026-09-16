import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import type { DispatchPlanItem } from '@/shared/types'

import {
  buildNonToolTaskReport,
  evaluateNonToolCriterion,
  extractImagePathFromText,
  extractImagePromptText,
  extractRequestedImageSize,
  IMAGE_PROMPT_MAX_CHARS,
  parseImageSize,
  pickImageTargetPath,
  readImagePixelSize,
  writeImageIntoWorkspace,
} from './image-delivery'
import { evaluateTaskResultReport } from './task-result-report'

/**
 * 回归：线上「落地发布组」的 t4「主图重做」4/4 次全部失败。
 *
 * 除了「生图模态挂 chat 适配器」（见 adapter-modality-routing.test.ts），还有第二层：
 * 生图成员**没有工具循环**，而派发门禁是按工具型成员设计的，于是：
 *  - 门禁要求 `report_task_result` → 生图 run 永远不上报，每次判 failed，重试到上限；
 *  - `targetPaths` / `expectedOutputs(image)` 没有证据与绑定 → 下游成员拿不到主图；
 *  - `requiredCommands` / `requiredEvidence` 是「自证式」要求，生图成员根本无从满足。
 *
 * 这里覆盖补偿逻辑本身：真实像素读取、工作区落盘、回报合成、门禁对非工具型成员的放宽边界。
 */

const tempRoots: string[] = []

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true })
})

function makeTempWorkspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agenthub-image-delivery-'))
  tempRoots.push(dir)
  return dir
}

/** 造一个只保留 IHDR 的最小 PNG 头（readImagePixelSize 只读 IHDR）。 */
function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'latin1')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  buf.writeUInt8(8, 24)
  buf.writeUInt8(6, 25)
  return buf
}

/** 造一个带 SOF0 的最小 JPEG 头。 */
function jpegBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(21)
  buf.writeUInt8(0xff, 0)
  buf.writeUInt8(0xd8, 1)
  buf.writeUInt8(0xff, 2)
  buf.writeUInt8(0xc0, 3)
  buf.writeUInt16BE(17, 4)
  buf.writeUInt8(8, 6)
  buf.writeUInt16BE(height, 7)
  buf.writeUInt16BE(width, 9)
  buf.writeUInt8(3, 11)
  return buf
}

function task(overrides: Partial<DispatchPlanItem> = {}): DispatchPlanItem {
  return {
    id: 't4',
    agentId: 'ag_EJVoixjLt9IK',
    task: '补救·仅做主图成品：生成 1920×1080 横版主视觉 PNG',
    taskKind: 'design',
    targetPaths: ['hero/hero-1920x1080.png'],
    acceptanceCriteria: ['交付真实可读的图片产物（非纯文字方案），比例为 16:9 或 1920×1080'],
    expectedOutputs: [{ id: 'hero_png', type: 'image', required: true }],
    requiredEvidence: ['`file hero/hero-1920x1080.png` 的实际输出（显示 PNG 与 1920x1080）'],
    requiredCommands: [{ command: 'file hero/hero-1920x1080.png' }],
    ...overrides,
  } as DispatchPlanItem
}

describe('生图成员交付：路径与尺寸解析', () => {
  it('只挑图片路径作为落盘目标', () => {
    expect(pickImageTargetPath(['landing/'])).toBeNull()
    expect(pickImageTargetPath(['landing/assets/hero.png'])).toBe('landing/assets/hero.png')
    expect(pickImageTargetPath(['a/notes.md', 'hero/hero-1920x1080.png'])).toBe(
      'hero/hero-1920x1080.png',
    )
    expect(pickImageTargetPath()).toBeNull()
  })

  it('优先认显式像素，其次认比例', () => {
    expect(extractRequestedImageSize('生成 1920×1080 横版主图')).toBe('1920*1080')
    expect(extractRequestedImageSize('尺寸 1024x768')).toBe('1024*768')
    expect(extractRequestedImageSize('输出 1440*1080')).toBe('1440*1080')
    expect(extractRequestedImageSize('横版 16:9')).toBe('1920*1080')
    expect(extractRequestedImageSize('竖版 9:16')).toBe('1080*1920')
    // 认不出必须返回 null —— 让适配器用默认尺寸，而不是瞎猜一个
    expect(extractRequestedImageSize('做一张好看的图')).toBeNull()
    expect(extractRequestedImageSize(undefined, '')).toBeNull()
  })

  it('尺寸字符串解析', () => {
    expect(parseImageSize('1920*1080')).toEqual({ width: 1920, height: 1080 })
    expect(parseImageSize('1920x1080')).toEqual({ width: 1920, height: 1080 })
    expect(parseImageSize('宽 1920 高 1080')).toBeNull()
  })

  it('读真实像素：PNG 与 JPEG 都认，垃圾字节返回 null', () => {
    expect(readImagePixelSize(pngBuffer(1920, 1080))).toEqual({ width: 1920, height: 1080 })
    expect(readImagePixelSize(jpegBuffer(1280, 720))).toEqual({ width: 1280, height: 720 })
    expect(readImagePixelSize(Buffer.from('not an image'))).toBeNull()
    expect(readImagePixelSize(Buffer.alloc(0))).toBeNull()
  })

  it('从判据文本里能找出图片路径', () => {
    expect(extractImagePathFromText('hero/hero-1920x1080.png 存在且为真实 PNG')).toBe(
      'hero/hero-1920x1080.png',
    )
    expect(extractImagePathFromText('图中中文全部可读')).toBeNull()
  })
})

describe('生图提示词提取：派发任务取头部（视觉要求在开头）', () => {
  const filler = '背景说明：本段用于把窗口推远，不含任何视觉信息。'
  const dispatchedTask = [
    '<task id="t4">',
    '补救·仅做主图成品。必须使用的固定文案：主图标题 Nexora Studio；副标题 你的智能协作工作台；',
    '主文案 从一句话，到可交付的产物。构图：左侧文字安全区 0-46%，右侧放界面卡，浅蓝渐变底 #FCFDFF。',
    '</task>',
    filler.repeat(80),
    '产出要求：1) 用 bash 把最终 PNG 保存到 workspace 路径 hero/hero-1920x1080.png；',
    '2) 用 file 确认真实 PNG；3) 不要动 landing/ 目录，不要生成落地页或 PPT。',
  ].join('\n')

  it('取头部：拿到固定文案与构图，不会被尾部的流程要求挤掉', () => {
    const prompt = extractImagePromptText(dispatchedTask, true)
    expect(prompt).toContain('Nexora Studio')
    expect(prompt).toContain('构图')
    expect(prompt).not.toContain('不要生成落地页或 PPT')
    expect(prompt).not.toContain('<task')
    expect(prompt.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS)
  })

  it('取尾部：普通会话里用户消息在末尾，沿用旧行为', () => {
    const prompt = extractImagePromptText(dispatchedTask, false)
    expect(prompt).toContain('不要生成落地页或 PPT')
    expect(prompt).not.toContain('Nexora Studio')
    expect(prompt.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS)
  })

  it('去掉 XML 标签并把换行压成空格（提示词不该带任务包装）', () => {
    const prompt = extractImagePromptText('<a>\n画一只猫\n</a>', true)
    expect(prompt).toBe('画一只猫')
  })
})

describe('生图成员交付：工作区落盘', () => {
  it('自动建目录并写入字节', () => {
    const root = makeTempWorkspace()
    const written = writeImageIntoWorkspace(root, 'hero/hero-1920x1080.png', pngBuffer(1920, 1080))
    expect(written).toBe('hero/hero-1920x1080.png')
    const bytes = readFileSync(path.join(root, 'hero', 'hero-1920x1080.png'))
    expect(readImagePixelSize(bytes)).toEqual({ width: 1920, height: 1080 })
  })

  it('越界路径一律拒绝（不许把图写到工作区之外）', () => {
    const root = makeTempWorkspace()
    expect(writeImageIntoWorkspace(root, '../escaped.png', pngBuffer(8, 8))).toBeNull()
    expect(writeImageIntoWorkspace(root, '/tmp/escaped.png', pngBuffer(8, 8))).toBeNull()
  })
})

describe('生图成员交付：回报合成（只写真实事实）', () => {
  it('尺寸与判据一致、文件已落盘 → 判过，并把文件名与列表写进证据', () => {
    const root = makeTempWorkspace()
    writeImageIntoWorkspace(root, 'hero/hero-1920x1080.png', pngBuffer(1920, 1080))
    const report = buildNonToolTaskReport(
      task({
        acceptanceCriteria: [
          '交付真实可读的图片产物（非纯文字方案），比例为 16:9 或 1920×1080',
          'hero/hero-1920x1080.png 存在且为真实 PNG，尺寸严格 1920×1080',
          '图中中文全部可读、无乱码错字',
        ],
      }),
      {
        taskId: 't4',
        agentName: '主图设计师',
        adapterName: 'image-gen',
        artifact: { id: 'art_hero', title: '生成的图片 · Nexora Studio', width: 1920, height: 1080 },
        targetPath: 'hero/hero-1920x1080.png',
        onDisk: { bytes: 33, width: 1920, height: 1080 },
        requestedSize: '1920*1080',
      },
    )

    expect(report.status).toBe('complete')
    expect(report.acceptanceResults).toHaveLength(3)
    expect(report.acceptanceResults?.every((r) => r.passed)).toBe(true)
    expect(report.filesChanged).toEqual([{ path: 'hero/hero-1920x1080.png', action: 'created' }])
    expect(report.summary).toContain('art_hero')
    expect(report.summary).toContain('1920×1080')
    // 命令 / 文件类证据要求必须如实说明已转交复查，不能装成自证过了
    expect(report.summary).toContain('复查阶段')
  })

  it('实际像素与判据要求不符 → 该条判失败，并写清差在哪（不假装通过）', () => {
    const result = evaluateNonToolCriterion('尺寸严格 1920×1080', {
      taskId: 't4',
      agentName: '主图设计师',
      adapterName: 'image-gen',
      artifact: { id: 'art_hero', title: '主图', width: 1024, height: 1024 },
      targetPath: 'hero/hero-1920x1080.png',
      onDisk: { bytes: 33, width: 1024, height: 1024 },
      requestedSize: '1920*1080',
    })
    expect(result.passed).toBe(false)
    expect(result.evidence).toContain('1920×1080')
    expect(result.evidence).toContain('1024×1024')
  })

  it('判据要求工作区文件但没落盘 → 判失败', () => {
    const result = evaluateNonToolCriterion('hero/hero-1920x1080.png 存在且为真实 PNG', {
      taskId: 't4',
      agentName: '主图设计师',
      adapterName: 'image-gen',
      artifact: { id: 'art_hero', title: '主图', width: 1920, height: 1080 },
      targetPath: 'hero/hero-1920x1080.png',
      onDisk: null,
      requestedSize: '1920*1080',
    })
    expect(result.passed).toBe(false)
    expect(result.evidence).toContain('实际没有落盘')
  })
})

describe('门禁对非工具型成员（image-gen）的放宽边界', () => {
  const evidence = {
    fileWrites: [],
    commands: [],
    artifacts: [{ artifactId: 'art_hero', title: '生成的图片 · Nexa', type: 'image' }],
  }

  const report = buildNonToolTaskReport(task(), {
    taskId: 't4',
    agentName: '主图设计师',
    adapterName: 'image-gen',
    artifact: { id: 'art_hero', title: '生成的图片 · Nexa', width: 1920, height: 1080 },
    targetPath: 'hero/hero-1920x1080.png',
    onDisk: { bytes: 33, width: 1920, height: 1080 },
    requestedSize: '1920*1080',
  })

  it('工具型成员：requiredCommands / requiredEvidence 没自证 → 照旧失败', () => {
    const strict = evaluateTaskResultReport(task(), report, evidence)
    expect(strict.ok).toBe(false)
    expect(strict.error).toMatch(/command evidence|required evidence/)
  })

  it('非工具型成员：跳过命令/文件自证要求后通过（产物 + targetPath 证据齐全）', () => {
    const relaxed = evaluateTaskResultReport(task(), report, evidence, { toolCapable: false })
    expect(relaxed.ok).toBe(true)
  })

  it('放宽不等于放水：没有交付回报照旧失败', () => {
    const missing = evaluateTaskResultReport(task(), undefined, evidence, { toolCapable: false })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain('report_task_result')
  })

  it('放宽不等于放水：验收标准没被逐条覆盖照旧失败', () => {
    const withoutCriteria = evaluateTaskResultReport(
      task({ acceptanceCriteria: ['图中中文全部可读、无乱码错字'] }),
      { status: 'complete', summary: '已出图' },
      evidence,
      { toolCapable: false },
    )
    expect(withoutCriteria.ok).toBe(false)
    expect(withoutCriteria.error).toContain('missing acceptance criteria')
  })

  it('放宽不等于放水：targetPaths 没有任何证据照旧失败', () => {
    // 回报逐条覆盖了验收标准、也声称出图了，但既没说落盘路径、evidence 里也没有产物 ——
    // targetPaths 门禁必须拦住（filesChanged 本身就是合法路径证据，所以这里刻意不带）。
    const withoutPathClaim = {
      status: 'complete' as const,
      summary: '已出图',
      acceptanceResults: (task().acceptanceCriteria ?? []).map((criterion) => ({
        criterion,
        passed: true,
        evidence: '已交付',
      })),
    }
    const noEvidence = evaluateTaskResultReport(
      task(),
      withoutPathClaim,
      { fileWrites: [], commands: [] },
      { toolCapable: false },
    )
    expect(noEvidence.ok).toBe(false)
    expect(noEvidence.error).toContain('target path evidence')
  })
})
