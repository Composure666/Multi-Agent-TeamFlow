import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import {
  BAILIAN_BASE_URL,
  BAILIAN_PROVIDER_ID,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_SIZE,
  isImageGenerationModel,
} from '@/lib/llm-shared'
import { upsertImageArtifact } from '@/server/artifact-image-group'
import { recordRunArtifact } from '@/server/dispatch-run-evidence'
import { storeGeneratedImage } from '@/server/generated-image-store'
import {
  extractRequestedImageSize,
  normalizeImageSize,
  readImagePixelSize,
  writeImageIntoWorkspace,
} from '@/server/image-delivery'
import { generateImageBuffer } from '@/server/image-generation'
import { resolveFailoverChain, runWithFailover, type FailoverCandidate } from '@/server/llm-failover'
import { countArtifactImages } from '@/shared/artifact-images'

import type { ToolDef } from './types'

/**
 * image_generate —— 面向 Agent 的按需生图工具。
 *
 * 与 `image-gen` **适配器**的分工（两者互补，不是替代）：
 *   - 适配器：Agent 的自有模型**就是**生图模型，整轮 run 的产出就是一张图，没有工具循环；
 *   - 本工具：Agent 是**普通 chat 模型 + 工具循环**，在需要配图时调一次工具拿图，
 *     然后继续用 write_artifact / fs_write / bash 做后续交付。
 *
 * 为什么要有这个工具：判断「能不能出图」的依据应该是**能力**，不是**成员分类**。
 * 2026-09-16 的事故正是把这两者搞混了 —— 旧不变式「模态=生图 ⇒ 强制 image-gen 适配器 +
 * 清空工具集」让「会不会出图」取决于成员被贴了什么标签，而不是它有没有生图能力，
 * 结果是把一批靠工具循环产图的视觉成员砍成了只会出一张栅格图的成员。
 *
 * 供应商也不绑死：候选链取自「设置-模型分配 → 生图 Agent」，即**生图能力**的配置位置，
 * 与具体 Agent 的模型 / Key 无关；链上没有生图模型时回退到百炼 + 默认生图模型。
 * 这样「换生图供应商」是一次配置改动，不需要逐个改 Agent。
 */

const MAX_PROMPT_CHARS = 2_000
const DEFAULT_TIMEOUT_MS = 180_000
const MIN_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 600_000

const NO_IMAGE_BACKEND_ERROR =
  'image_generate 没有可用的生图后端：「设置-模型分配 → 生图 Agent」这条链上一个生图模型都没有，' +
  '供应商中心里也没有可用的阿里云百炼 Key。' +
  '怎么修（二选一）：① 到「设置-模型分配 → 生图 Agent」给它选一个生图模型（如 z-image-turbo / qwen-image-3.0）；' +
  '② 到「设置-供应商」给阿里云百炼补上 API Key（或配置环境变量 BAILIAN_API_KEY）。配置后无需重启即可生效。'

const ArgsSchema = z
  .object({
    prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    size: z.string().optional(),
    targetPath: z.string().optional(),
    timeoutMs: z.number().int().optional(),
  })
  .strict()

export const imageGenerateTool: ToolDef = {
  name: 'image_generate',
  description:
    'Generate a real picture with a text-to-image model and deliver it as an image artifact (optionally also as a file inside the workspace). Use this whenever the task needs an actual bitmap image — hero image, illustration, poster, product shot, background, OG cover, sticker set. Put the full visual description in prompt (subject, composition, style, palette, lighting, and any text that must appear). Pass size when the task fixes dimensions (e.g. "1920x1080" or "16:9"); pass targetPath (workspace-relative, e.g. "assets/hero.png") when a later step must read the file from disk. Do NOT use it for charts, diagrams or UI mockups — build those with write_artifact (mermaid / HTML), which stays editable and does not cost an image call. The image model comes from Settings → Model Assignment → 生图 Agent, so no per-agent API key is required.',
  parameters: {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: {
        type: 'string',
        description: `What to draw, in one self-contained description (up to ${MAX_PROMPT_CHARS} characters). Describe the picture itself — subject, framing, style, palette, lighting, mood — not the workflow. To render text inside the image, write the exact characters and say where they go.`,
      },
      size: {
        type: 'string',
        description:
          'Requested output size. Accepts pixels ("1920x1080", "1024x1024") or a ratio ("16:9", "9:16", "4:3", "1:1"). Defaults to what the task text asks for, otherwise 1024x1024. The model quantizes to a 64px grid; the tool crops the few extra pixels back to the requested size.',
      },
      targetPath: {
        type: 'string',
        description:
          'Optional workspace-relative path to also write the PNG to (e.g. "assets/hero.png"). Use this when the plan requires a real file on disk for a later step; the artifact is created either way.',
      },
      timeoutMs: {
        type: 'integer',
        minimum: MIN_TIMEOUT_MS,
        maximum: MAX_TIMEOUT_MS,
        description: `Per-model timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
      },
    },
    additionalProperties: false,
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: `Invalid args: ${parsed.error.message}` }

    const { prompt, size, targetPath, timeoutMs } = parsed.data
    const requestedSize = normalizeRequestedSize(size, prompt)
    const timeout = clamp(timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)

    try {
      const candidates = await resolveImageCandidates()
      if (candidates.length === 0) return { ok: false, error: NO_IMAGE_BACKEND_ERROR }

      // 每个候选一次独立尝试：生图失败（额度 / 鉴权 / 5xx / 超时）时按链降级到下一个供应商。
      // canSwitch 恒 true —— 出图前没有任何内容吐给用户，切换不会产生两段矛盾输出。
      const generated = await runWithFailover<Buffer>(
        candidates,
        (candidate) =>
          withTimeout(ctx.abortSignal, timeout, (signal) =>
            generateImageBuffer({
              apiBaseUrl: candidate.apiBaseUrl ?? '',
              apiKey: candidate.apiKey,
              modelId: candidate.modelId,
              prompt,
              size: requestedSize,
              signal,
            }),
          ),
        {
          capabilityKey: 'agent:image',
          signal: ctx.abortSignal,
          canSwitch: () => true,
        },
      )

      const usedModel = generated.candidate.modelId
      // 模型输出尺寸是 64 的倍数（请求 1920×1080 实得 1920×1088），交付前居中修边到请求尺寸，
      // 让落盘文件 / 产物记录 / 验收判据三者说的是同一个尺寸。
      const normalized = normalizeImageSize(generated.value, requestedSize)
      const delivered = normalized.buffer
      // 真实像素以交付字节流为准：模型不保证按请求尺寸出图，拿请求值当结果回报就是假证据。
      const pixels = readImagePixelSize(delivered) ?? parseRequestedSize(requestedSize)

      const savedPath = targetPath
        ? writeImageIntoWorkspace(ctx.workspacePath, targetPath, delivered)
        : null

      const stored = await storeGeneratedImage(delivered, ctx.workspacePath)
      if (!stored.ok) {
        return {
          ok: false,
          error:
            `图片已生成但存储失败（${stored.error}）—— 产物无法交付。` +
            '请检查「设置-供应商」里的 OSS 配置，或确认数据目录可写。',
        }
      }

      const artifact = await upsertImageArtifact({
        conversationId: ctx.conversationId,
        agentId: ctx.agentId,
        imageUrl: stored.url,
        alt: prompt,
        ...(pixels ? { width: pixels.width, height: pixels.height } : {}),
        now: Date.now(),
      })
      // 产物计入 run 的验收证据：否则「用 image_generate 交付图片」的任务过不了 targetPaths 门禁。
      recordRunArtifact(ctx.runId, {
        artifactId: artifact.id,
        title: artifact.title,
        type: 'image',
        version: artifact.version,
      })

      const imageCount = countArtifactImages(artifact.content)

      return {
        ok: true,
        value: {
          artifactId: artifact.id,
          title: artifact.title,
          version: artifact.version,
          url: stored.url,
          model: usedModel,
          requestedSize,
          ...(pixels ? { width: pixels.width, height: pixels.height } : {}),
          // 告诉 Agent 这张图被并进了图集 —— 它不必（也不该）再为每张图单独交付一次
          ...(imageCount > 1 ? { mergedIntoGallery: true, imageCount } : {}),
          ...(savedPath ? { savedPath } : {}),
          ...(targetPath && !savedPath
            ? {
                savedPathError:
                  `未能落盘到 ${targetPath}：targetPath 必须是工作区内的相对路径，且不能越界` +
                  '（`..` 与绝对路径都会被拒）。产物本身已交付；若下游依赖该文件，请用合法路径重试。',
              }
            : {}),
          ...(normalized.note ? { note: normalized.note } : {}),
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: buildFailureMessage(message, prompt) }
    }
  },
}

/**
 * 失败信息给全「我看到了什么 / 应该长什么样 / 怎么修」，
 * 而不是把 SDK 原文直接甩回给模型（模型只能靠猜，然后重复同一个错）。
 */
function buildFailureMessage(message: string, prompt: string): string {
  return (
    `image_generate 调用失败：${message}` +
    `（本次 prompt 前 60 字：${prompt.slice(0, 60)}）。` +
    '排查顺序：① 生图模型名是否正确（「设置-模型分配 → 生图 Agent」）；' +
    '② 该供应商的 Key 是否有效、额度是否用尽；③ 提示词是否触发内容审核。' +
    '如果只是某一家供应商不可用，换一个生图模型即可 —— 本工具会按分配链自动降级。'
  )
}

/** 尺寸归一：显式参数 → prompt 里写的尺寸 / 比例 → 默认 1024x1024。 */
export function normalizeRequestedSize(size: string | undefined, prompt: string): string {
  const fromArgs = size?.trim() ? extractRequestedImageSize(size) : null
  if (fromArgs) return fromArgs
  const fromPrompt = extractRequestedImageSize(prompt)
  if (fromPrompt) return fromPrompt
  return DEFAULT_IMAGE_SIZE
}

/** `1920*1080` → `{ width, height }`；解析不出返回 null。 */
function parseRequestedSize(size: string): { width: number; height: number } | null {
  const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(size.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * 生图候选链 = 「设置-模型分配 → 生图 Agent」里配的那条链（只保留生图模型）。
 *
 * 链上没有生图模型时回退到「百炼 + 默认生图模型」：让开箱即用的百炼部署不必先配一次
 * 分配表也能出图（与 web_search 解析后端凭证同一取向）。
 *
 * **过滤是必须的**：链上混入 chat 模型会在轮到它时撞一次 400「url error」，而且这类
 * 参数/业务错不触发降级，直接带走整个工具调用。同理，缺 Base URL 的候选也无法发起请求。
 */
export async function resolveImageCandidates(): Promise<FailoverCandidate[]> {
  const fromAssignment = (await resolveFailoverChain('agent:image')).filter(
    (candidate) => isImageGenerationModel(candidate.modelId) && Boolean(candidate.apiBaseUrl),
  )
  if (fromAssignment.length > 0) return fromAssignment

  const fallback = await builtinBailianImageCandidate()
  return fallback ? [fallback] : []
}

/**
 * 兜底候选：百炼 + 默认生图模型（`z-image-turbo`）。
 *
 * 只在「分配表里没有生图模型」时使用。Key 解析顺序与 web_search 一致：DB 供应商行 → 环境变量。
 */
async function builtinBailianImageCandidate(): Promise<FailoverCandidate | null> {
  let apiKey = ''
  let apiBaseUrl = BAILIAN_BASE_URL
  try {
    const row = await db.query.llmProviders.findFirst({
      where: eq(schema.llmProviders.id, BAILIAN_PROVIDER_ID),
    })
    apiKey = row?.apiKey?.trim() ?? ''
    if (row?.baseUrl?.trim()) apiBaseUrl = row.baseUrl.trim()
  } catch (err) {
    console.warn('[image_generate] 读取百炼供应商配置失败，改用环境变量', err)
  }
  if (!apiKey) apiKey = process.env.BAILIAN_API_KEY?.trim() ?? ''
  if (!apiKey) return null

  return {
    providerId: BAILIAN_PROVIDER_ID,
    provider: 'openai-compatible',
    apiKey,
    apiBaseUrl,
    modelId: DEFAULT_IMAGE_MODEL,
  }
}

/** 给一次尝试套上「本次超时 + 外层取消」的组合信号。 */
async function withTimeout<T>(
  parent: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`生图超时（${timeoutMs}ms 未返回）`)),
    timeoutMs,
  )
  const onAbort = () => controller.abort(parent.reason ?? new Error('image_generate aborted'))
  if (parent.aborted) onAbort()
  else parent.addEventListener('abort', onAbort, { once: true })

  try {
    return await run(controller.signal)
  } catch (err) {
    if (controller.signal.aborted && !parent.aborted) {
      throw new Error(`生图超时（超过 ${timeoutMs}ms 未返回）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', onAbort)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
