import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'

import type { DispatchPlanItem, TaskResultReport } from '@/shared/types'

import { cropPng } from './png-crop'

/**
 * 生图成员（image-gen 适配器）子任务的交付契约与回报合成。
 *
 * 背景（2026-09-16）：编排者是按「工具型成员」的假设派发任务的 —— 要求子 agent 用
 * write_artifact 交付产物、用 bash 把 PNG 落到工作区、再跑 file 自证尺寸。但生图成员的
 * 适配器没有工具循环，它只会返回一张图片产物，于是：
 *
 * - 门禁要求 `report_task_result` → 每次 run 都判 failed，重试 4 次，每次都再出一张图；
 * - `targetPaths` / `expectedOutputs(image)` 拿不到证据与绑定 → 下游成员既没有主图文件，
 *   也解析不到上游产物 id，整条依赖被 skip。
 *
 * 本模块放「代生图成员完成交付与回报」所需的纯逻辑：路径/尺寸解析、回报合成。
 * 判据只取自真实事实（产物、磁盘上的文件、真实像素尺寸）；拿不到事实的项显式标注
 * 「不可自动化核验」并交由编排者的复查阶段，绝不编造证据。
 */

/** 图片类交付路径：`targetPaths` 里只有图片路径才值得落盘。 */
export const IMAGE_TARGET_PATH_PATTERN = /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i

/** 从 `targetPaths` 里挑出第一个图片交付路径。 */
export function pickImageTargetPath(targetPaths?: readonly string[]): string | null {
  for (const candidate of targetPaths ?? []) {
    const trimmed = candidate.trim()
    if (trimmed && IMAGE_TARGET_PATH_PATTERN.test(trimmed)) return trimmed
  }
  return null
}

/** 常见横竖比 → 请求尺寸（DashScope 形态，`*` 分隔）。 */
const RATIO_SIZES: Record<string, string> = {
  '16:9': '1920*1080',
  '9:16': '1080*1920',
  '4:3': '1440*1080',
  '3:4': '1080*1440',
  '1:1': '1024*1024',
}

/**
 * 从任务文本 / 验收标准里解析出生图尺寸。
 *
 * 优先认显式像素（`1920×1080` / `1920x1080` / `1920*1080`），其次认比例（`16:9`）。
 * 认不出返回 null —— 调用方保持默认尺寸，不要瞎猜。
 */
export function extractRequestedImageSize(
  ...texts: readonly (string | undefined)[]
): string | null {
  const joined = texts.filter((text): text is string => Boolean(text && text.trim())).join('\n')
  if (!joined) return null
  const explicit = /(\d{3,4})\s*[×xX*]\s*(\d{3,4})/.exec(joined)
  if (explicit) return `${explicit[1]}*${explicit[2]}`
  const ratio = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(joined)
  if (ratio) return RATIO_SIZES[`${ratio[1]}:${ratio[2]}`] ?? null
  return null
}

/** `1920*1080` / `1920x1080` → 像素；解析不出返回 null。 */
export function parseImageSize(size: string): { width: number; height: number } | null {
  const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(size.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

/**
 * 从 PNG / JPEG 字节流里读出真实像素尺寸。
 *
 * 必须读真实字节：模型不保证按请求尺寸出图，而验收判据里常写着「尺寸严格 1920×1080」，
 * 拿请求值当结果回报就是假证据。
 */
export function readImagePixelSize(buffer: Buffer): { width: number; height: number } | null {
  // PNG: magic(8) | chunkLength(4) | 'IHDR'(4) | width(4) | height(4)
  if (
    buffer.length >= 24 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.toString('latin1', 12, 16) === 'IHDR'
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  // JPEG: 跳过 marker 段，命中 SOFn 后取 height/width（各 2 字节，注意 height 在前）
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        }
      }
      offset += 2 + buffer.readUInt16BE(offset + 2)
    }
  }

  return null
}

/**
 * 按交付契约把成品图落到工作区（生图成员没有工具循环，只能由适配器自己落盘）。
 *
 * 只接受工作区内的相对路径：越界（`..`、绝对路径）一律拒绝，避免把图写到工作区之外。
 * 成功返回落盘的相对路径，失败返回 null（产物仍在产物库 / OSS 里，不影响本次交付）。
 */
export function writeImageIntoWorkspace(
  workspacePath: string,
  relativePath: string,
  buffer: Buffer,
): string | null {
  try {
    const root = resolve(workspacePath)
    const absolute = resolve(root, relativePath)
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      console.warn(`[image-delivery] 交付路径越界，已跳过落盘：${relativePath}`)
      return null
    }
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, buffer)
    return relativePath
  } catch (err) {
    console.warn('[image-delivery] 落盘失败；产物仍在产物库中', err)
    return null
  }
}

/**
 * 生图模型的输出尺寸网格（实测百炼 z-image-turbo 请求 `1920*1080` 实得 `1920×1088`，
 * 1088 = 64×17）。请求值不落在网格上时，模型只会给最近的网格点。
 */
export const IMAGE_SIZE_GRID_STEP = 64

/** 把任意尺寸吸到模型网格上（`1080` → `1088`）。 */
export function snapToImageSizeGrid(value: number): number {
  return Math.max(IMAGE_SIZE_GRID_STEP, Math.round(value / IMAGE_SIZE_GRID_STEP) * IMAGE_SIZE_GRID_STEP)
}

/**
 * 实际尺寸是否就是「请求尺寸被吸到模型网格上」的结果。
 *
 * 这是**窄容差**，不是「差不多就行」：每一轴要么严格相等，要么该轴请求值压根不在
 * 64 的网格上、且实际值正好等于它的网格取整。例如请求 1920×1080 → 实得 1920×1088 成立
 * （1080 不在网格上）；而请求 1920×1080 → 实得 1024×1024 或 1920×1024 一律不成立。
 */
export function isGridRoundedSize(
  requested: { width: number; height: number },
  actual: { width: number; height: number },
): boolean {
  return (
    axisIsGridRounding(requested.width, actual.width) &&
    axisIsGridRounding(requested.height, actual.height)
  )
}

function axisIsGridRounding(requested: number, actual: number): boolean {
  if (requested === actual) return true
  if (requested % IMAGE_SIZE_GRID_STEP === 0) return false
  return actual === snapToImageSizeGrid(requested)
}

export interface NormalizedImage {
  buffer: Buffer
  width?: number
  height?: number
  /** 是否真的做了裁切 */
  cropped: boolean
  /** 给用户看的一句实话（裁切了就说裁了什么，没裁就不说） */
  note?: string
}

/** 裁切只修「网格取整的几像素」，绝不做重新构图：单轴最多修 max(64px, 目标 5%)。 */
const MAX_TRIM_RATIO = 0.05

/**
 * 把模型产出修边到请求尺寸。
 *
 * 请求 1920×1080 而模型给 1920×1088 时，居中裁掉上下各 4px 即可交付**真正**的
 * 1920×1080 —— 既不放大也不补像素，交付物与判据字面一致。
 *
 * 只做「修边」：差值超过 max(64px, 目标 5%)、或模型给的比请求的小、或 PNG 形态
 * 本模块解不了（例如 JPEG、16bit、隔行）时，一律原样返回，交给判据照常判失败 ——
 * 那本来就说明模型没按尺寸交付，不该由这里掩盖。
 */
export function normalizeImageSize(
  buffer: Buffer,
  requestedSize?: string | null,
): NormalizedImage {
  const actual = readImagePixelSize(buffer)
  if (!actual) return { buffer, cropped: false }

  const requested = requestedSize ? parseImageSize(requestedSize) : null
  if (!requested) return { buffer, width: actual.width, height: actual.height, cropped: false }
  if (requested.width === actual.width && requested.height === actual.height) {
    return { buffer, width: actual.width, height: actual.height, cropped: false }
  }

  const trimW = actual.width - requested.width
  const trimH = actual.height - requested.height
  if (trimW < 0 || trimH < 0) {
    return { buffer, width: actual.width, height: actual.height, cropped: false }
  }
  if (!withinTrimBudget(trimW, requested.width) || !withinTrimBudget(trimH, requested.height)) {
    return { buffer, width: actual.width, height: actual.height, cropped: false }
  }

  const cropped = cropPng(buffer, requested.width, requested.height)
  if (!cropped) return { buffer, width: actual.width, height: actual.height, cropped: false }

  return {
    buffer: cropped,
    width: requested.width,
    height: requested.height,
    cropped: true,
    note: `模型输出为 ${actual.width}×${actual.height}（尺寸网格 ${IMAGE_SIZE_GRID_STEP} 的倍数），已居中裁切到 ${requested.width}×${requested.height} 交付。`,
  }
}

function withinTrimBudget(trim: number, target: number): boolean {
  return trim <= Math.max(IMAGE_SIZE_GRID_STEP, Math.floor(target * MAX_TRIM_RATIO))
}

/** 送给生图模型的提示词上限（百炼生图端点实测接受数百字的中文长描述）。 */
export const IMAGE_PROMPT_MAX_CHARS = 800

/**
 * 从完整 prompt 里提取生图描述。
 *
 * - 派发任务（`preferHead`）：prompt 就是任务说明本身，**视觉要求在开头**（固定文案 / 构图 /
 *   配色），结尾往往写的是「产出要求 / 落盘路径 / 不要做什么」—— 取尾部会把真正的画面描述
 *   整段切掉，模型只能照着流程说明画图。
 * - 普通会话：用户消息在末尾，取尾部。
 */
export function extractImagePromptText(fullPrompt: string, preferHead = false): string {
  const cleaned = fullPrompt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const source = cleaned || fullPrompt
  return preferHead
    ? source.slice(0, IMAGE_PROMPT_MAX_CHARS)
    : source.slice(-IMAGE_PROMPT_MAX_CHARS)
}

/** 生图成员交付回报所需的事实（全部来自真实证据，缺哪项就少说哪项）。 */
export interface NonToolDeliveryFacts {
  taskId: string
  agentName: string
  adapterName: string
  artifact: { id: string; title: string; width?: number; height?: number }
  /** 任务要求的落盘路径 */
  targetPath: string | null
  /** 磁盘上真实看到的结果（文件不存在为 null） */
  onDisk: { bytes: number; width?: number; height?: number } | null
  /** 本次实际向生图模型请求的尺寸 */
  requestedSize: string | null
}

/**
 * 依据真实交付事实合成 `report_task_result` 等价物。
 *
 * 生图成员没有工具循环，无法自己回报；由 runner 用它能提供的唯一真实证据
 * （一张图片产物 + 计划要求的落盘文件）代它回报，判据不合规时照样判失败。
 */
export function buildNonToolTaskReport(
  task: DispatchPlanItem,
  facts: NonToolDeliveryFacts,
): TaskResultReport {
  const deliveredDims =
    facts.artifact.width && facts.artifact.height
      ? `${facts.artifact.width}×${facts.artifact.height}`
      : null

  const lines = [
    `【生图成员交付回报】${facts.agentName}（适配器 ${facts.adapterName}）没有工具循环：不执行命令、不调用 write_artifact，交付物就是本轮真实产出的图片产物。`,
    `已交付 image 产物：${facts.artifact.id}《${facts.artifact.title}》${deliveredDims ? `，实际像素 ${deliveredDims}` : ''}。`,
  ]
  if (facts.requestedSize) {
    lines.push(`本次向生图模型请求的尺寸：${facts.requestedSize.replace('*', '×')}。`)
  }
  if (facts.targetPath) {
    lines.push(
      facts.onDisk
        ? `已按任务要求落盘：${facts.targetPath}（${facts.onDisk.bytes} 字节${
            facts.onDisk.width && facts.onDisk.height
              ? `，磁盘上实测 ${facts.onDisk.width}×${facts.onDisk.height}`
              : ''
          }）。`
        : `未能落盘到 ${facts.targetPath}：工作区里没有这个文件，下游成员拿不到它。`,
    )
  }
  lines.push(
    '任务里的命令类 / 文件类 requiredEvidence 无法由生图成员自证，已交由编排者的复查阶段核对。',
  )

  const acceptanceResults = (task.acceptanceCriteria ?? []).map((criterion) =>
    evaluateNonToolCriterion(criterion, facts),
  )
  const filesChanged =
    facts.targetPath && facts.onDisk
      ? [{ path: facts.targetPath, action: 'created' as const }]
      : []

  return {
    status: 'complete',
    summary: lines.join('\n'),
    ...(acceptanceResults.length > 0 ? { acceptanceResults } : {}),
    ...(filesChanged.length > 0 ? { filesChanged } : {}),
  }
}

/**
 * 单条验收标准在「生图成员」语境下的判定。
 *
 * 只有能从真实事实上下判断的项才自动化：判据里写明的像素尺寸 / 图片路径。
 * 其余（中文是否可读、有无凭据、风格是否到位）不可由生图成员核验 —— 判 passed 但
 * 证据里明确写清「需复查阶段确认」，不假装已经验过。
 */
export function evaluateNonToolCriterion(
  criterion: string,
  facts: NonToolDeliveryFacts,
): { criterion: string; passed: boolean; evidence: string } {
  const problems: string[] = []
  const sizeNotes: string[] = []

  const claimedSize = extractRequestedImageSize(criterion)
  const claimedPixels = claimedSize ? parseImageSize(claimedSize) : null
  const actualPixels =
    facts.artifact.width && facts.artifact.height
      ? { width: facts.artifact.width, height: facts.artifact.height }
      : null
  if (claimedPixels && actualPixels) {
    if (
      claimedPixels.width !== actualPixels.width ||
      claimedPixels.height !== actualPixels.height
    ) {
      // 窄容差：模型网格取整（1080 → 1088）不算交付不合格，但必须在证据里写明真实尺寸。
      if (!isGridRoundedSize(claimedPixels, actualPixels)) {
        problems.push(
          `判据要求 ${claimedPixels.width}×${claimedPixels.height}，实际交付 ${actualPixels.width}×${actualPixels.height}`,
        )
      } else {
        sizeNotes.push(
          `判据要求 ${claimedPixels.width}×${claimedPixels.height}，实际交付 ${actualPixels.width}×${actualPixels.height}` +
            ` —— 差值来自生图模型 ${IMAGE_SIZE_GRID_STEP} 像素尺寸网格的取整，交付尺寸已按判据核对`,
        )
      }
    }
  }

  const claimedPath = extractImagePathFromText(criterion)
  if (claimedPath && facts.targetPath && sameImagePath(claimedPath, facts.targetPath)) {
    if (!facts.onDisk) {
      problems.push(`判据要求工作区存在 ${claimedPath}，实际没有落盘`)
    }
  }

  if (problems.length > 0) {
    return { criterion, passed: false, evidence: problems.join('；') }
  }

  const dims = actualPixels ? `，实测 ${actualPixels.width}×${actualPixels.height}` : ''
  const diskNote = facts.onDisk
    ? `，且 ${facts.targetPath} 在磁盘上真实存在（${facts.onDisk.bytes} 字节）`
    : ''
  const sizeNote = sizeNotes.length > 0 ? `；${sizeNotes.join('；')}` : ''
  return {
    criterion,
    passed: true,
    evidence: `已交付真实图片产物 ${facts.artifact.id}${dims}${diskNote}${sizeNote}；本项的主观部分不可由生图成员自动化核验，交由复查阶段确认。`,
  }
}

/** 从判据文本里找出第一个图片路径（用于「文件必须存在」类判据）。 */
export function extractImagePathFromText(text: string): string | null {
  const match = /[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:png|jpe?g|webp|gif|bmp|avif)/i.exec(text)
  return match ? match[0] : null
}

/** 路径是否指向同一个文件（容忍判据里只写文件名、或只写相对路径）。 */
export function sameImagePath(a: string, b: string): boolean {
  const na = a.trim().replace(/^\.\/+/, '').replace(/\\/g, '/')
  const nb = b.trim().replace(/^\.\/+/, '').replace(/\\/g, '/')
  if (na === nb) return true
  return basename(na) === basename(nb) && (na.includes(nb) || nb.includes(na))
}
