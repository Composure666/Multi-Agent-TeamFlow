import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { db, schema } from '@/db/client'
import {
  DASHSCOPE_IMAGE_GENERATION_PATH,
  DASHSCOPE_NATIVE_ORIGIN,
  resolveImageApiProtocol,
  toDashScopeSize,
} from '@/lib/llm-shared'
import { appendImageToArtifact, resolveImageArtifactTarget } from '@/server/artifact-image-group'
import {
  extractImagePromptText,
  normalizeImageSize,
  readImagePixelSize,
  writeImageIntoWorkspace,
} from '@/server/image-delivery'
import { newArtifactId, newMessageId } from '@/server/ids'
import { runWithFailover } from '@/server/llm-failover'
import { getOssImageConfig, uploadImageToOss } from '@/server/oss-image-store'
import type { ArtifactContent, ArtifactRecord, StreamEvent } from '@/shared/types'

import type { AdapterFailoverCandidate, AdapterInput, AgentPlatformAdapter } from './types'

/**
 * ImageGenAdapter —— 生图 Agent 适配器。
 *
 * 调用 OpenAI 兼容的 /images/generations 端点生成图片，
 * 上传到 OSS 获取稳定 URL，创建 image 类型 artifact，
 * 通过 StreamEvent 返回给前端。
 *
 * 配置来源（agent 级别）：
 * - apiKey: agent.apiKey（必填）
 * - apiBaseUrl: agent.apiBaseUrl（必填，如 https://api.siliconflow.cn/v1）
 * - modelId: agent.modelId（必填，生图模型名如 flux-1-dev）
 *
 * 支持两套生图协议，按 Base URL 自动选择：
 * - OpenAI 兼容 `POST {baseUrl}/images/generations`（SiliconFlow 等）
 * - 阿里云百炼原生 `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
 *   （百炼的 OpenAI 兼容层没有 /images/generations，实测 404）
 *
 * 降级兜底：`input.failoverChain` 给出候选链（主 → 兜底），逐个尝试直到出图成功。
 */
/** 交付契约没给尺寸时的默认请求尺寸（OpenAI 风格写法，按协议转换后发出）。 */
const DEFAULT_IMAGE_SIZE = '1024x1024'

export class ImageGenAdapter implements AgentPlatformAdapter {
  readonly name = 'image-gen' as const

  async *stream(input: AdapterInput, signal: AbortSignal): AsyncIterable<StreamEvent> {
    const messageId = newMessageId()
    const base = { conversationId: input.conversationId, timestamp: Date.now() }

    // 候选链：AgentRunner 解析好的「主生图模型 → 兜底生图模型」；
    // 缺省时退化成只用 agent 自己配的那一个（保持旧行为）。
    const chain: AdapterFailoverCandidate[] =
      input.failoverChain && input.failoverChain.length > 0
        ? input.failoverChain
        : [
            {
              providerId: null,
              provider: 'openai-compatible',
              apiKey: input.apiKey ?? '',
              apiBaseUrl: input.apiBaseUrl,
              modelId: input.modelId ?? '',
            },
          ]
    const candidates = chain.filter((c) => c.apiKey && c.apiBaseUrl && c.modelId)

    // 校验配置：逐项给出可操作的提示，而不是笼统地报「配置错误」
    if (candidates.length === 0) {
      if (!input.apiKey) {
        yield* this.yieldError(
          input,
          messageId,
          '生图 Agent 需要配置 API Key：请在「设置 - 模型分配」里给「生图 Agent」选择已配置的供应商，或在该 Agent 上单独填写。',
        )
        return
      }
      if (!input.apiBaseUrl) {
        yield* this.yieldError(
          input,
          messageId,
          '生图 Agent 需要配置 API Base URL：请在「设置 - 供应商」里为该供应商补上 Base URL。',
        )
        return
      }
      if (!input.modelId) {
        yield* this.yieldError(
          input,
          messageId,
          '生图 Agent 需要配置模型 ID：请在「设置 - 模型分配」里给「生图 Agent」选一个生图模型（如 z-image-turbo）。',
        )
        return
      }
      yield* this.yieldError(input, messageId, '没有可用的生图模型候选：候选链里的供应商都缺少 Key 或 Base URL。')
      return
    }

    yield { ...base, type: 'run.start', runId: input.runId, agentId: input.agentId, triggerMessageId: '' }
    yield { ...base, type: 'message.start', messageId, agentId: input.agentId, runId: input.runId }

    // 提取生图 prompt（直接用外层拼好的 prompt，生图模型能处理数百字长描述）。
    // 派发任务时 prompt 就是任务说明，视觉要求在开头 —— 交给提取函数判方向。
    const prompt = extractImagePromptText(input.prompt, Boolean(input.deliveryContract))

    // text part：描述正在做什么
    const textPartIndex = 0
    yield {
      ...base,
      type: 'part.start',
      messageId,
      partIndex: textPartIndex,
      part: { type: 'text', content: `正在生成图片：${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}` },
    }

    try {
      // 调用生图 API（主模型失败时按候选链降级；状态文案不算模型输出，可以安全切换）
      // 交付契约给了尺寸（派发任务里写了 1920×1080 / 16:9 之类）就按它生成；
      // 少了这一步，任务验收里「尺寸严格 1920×1080」这类判据必然判不过。
      const requestedSize = input.deliveryContract?.imageSize ?? DEFAULT_IMAGE_SIZE
      const generated = await runWithFailover(
        candidates,
        (candidate) =>
          this.generateImage(
            candidate.apiBaseUrl as string,
            candidate.apiKey,
            candidate.modelId,
            prompt,
            signal,
            requestedSize,
          ),
        {
          capabilityKey: input.failoverCapabilityKey ?? 'agent:image',
          signal,
          canSwitch: () => true,
        },
      )
      const imageResult = generated.value
      const usedModel = generated.candidate.modelId
      // 模型输出网格是 64 的倍数（请求 1920×1080 实得 1920×1088），交付前居中修边到请求尺寸，
      // 让落盘文件 / 产物记录 / 验收判据三者说的是同一个尺寸。
      const normalized = normalizeImageSize(imageResult.buffer, requestedSize)
      const deliveredBuffer = normalized.buffer
      // 真实像素以交付的字节流为准：模型不保证按请求尺寸出图，拿请求值当结果回报就是假证据。
      const pixels = readImagePixelSize(deliveredBuffer) ?? parseSizeToPixels(requestedSize)

      // 按交付契约落盘：生图成员没有工具循环，下游成员要按计划路径拿真实文件。
      const deliveredPath = input.deliveryContract?.imageTargetPath
        ? writeImageIntoWorkspace(
            input.workspacePath,
            input.deliveryContract.imageTargetPath,
            deliveredBuffer,
          )
        : null

      // 上传到 OSS（如果配置了），否则存本地
      const imageUrl = await this.storeImage({ buffer: deliveredBuffer }, input.conversationId)

      // 创建 artifact
      const artifact = await this.createImageArtifact(
        input.conversationId,
        input.agentId,
        imageUrl,
        prompt,
        pixels?.width,
        pixels?.height,
      )

      // 更新 text part 为完成描述
      yield {
        ...base,
        type: 'part.delta',
        messageId,
        partIndex: textPartIndex,
        delta: {
          type: 'text.append',
          text: `\n\n图片已生成并保存为产物（模型：${usedModel}${
            pixels ? `，${pixels.width}×${pixels.height}` : ''
          }）。${normalized.note ? `\n${normalized.note}` : ''}${
            deliveredPath ? `\n已按任务要求落盘：${deliveredPath}。` : ''
          }`,
        },
      }
      yield { ...base, type: 'part.end', messageId, partIndex: textPartIndex }

      // artifact.create 事件
      yield { ...base, type: 'artifact.create', artifact: this.toArtifactRecord(artifact) }

      yield { ...base, type: 'message.end', messageId }
      yield {
        ...base,
        type: 'run.end',
        runId: input.runId,
        status: 'complete',
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      yield {
        ...base,
        type: 'part.delta',
        messageId,
        partIndex: textPartIndex,
        delta: { type: 'text.append', text: `\n\n生成失败：${errorMsg}` },
      }
      yield { ...base, type: 'part.end', messageId, partIndex: textPartIndex }
      yield { ...base, type: 'message.end', messageId }
      yield { ...base, type: 'run.end', runId: input.runId, status: 'failed', error: errorMsg }
    }
  }

  /** 调用生图端点：按 Base URL 决定走 OpenAI 兼容协议还是百炼原生协议。 */
  private async generateImage(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    signal: AbortSignal,
    size: string,
  ): Promise<{ buffer: Buffer; width?: number; height?: number }> {
    if (resolveImageApiProtocol(baseUrl) === 'dashscope') {
      return this.generateImageWithDashScope(baseUrl, apiKey, modelId, prompt, signal, size)
    }
    return this.generateImageWithOpenAiCompatible(baseUrl, apiKey, modelId, prompt, signal, size)
  }

  /** 调用 OpenAI 兼容的 /images/generations */
  private async generateImageWithOpenAiCompatible(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    signal: AbortSignal,
    size: string,
  ): Promise<{ buffer: Buffer; width?: number; height?: number }> {
    const url = `${baseUrl.replace(/\/$/, '')}/images/generations`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        prompt,
        n: 1,
        size: size.replace(/\*/g, 'x'),
        response_format: 'url',
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`生图 API 返回 ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const first = data?.data?.[0]
    if (!first) throw new Error('生图 API 返回为空')

    // 处理 b64_json
    if (first.b64_json) {
      const buffer = Buffer.from(first.b64_json, 'base64')
      return { buffer }
    }

    // 处理 url：下载图片
    if (first.url) {
      return this.downloadImage(first.url, signal)
    }

    throw new Error('生图 API 返回格式不支持（需要 url 或 b64_json）')
  }

  /**
   * 调用阿里云百炼原生生图端点。
   *
   * 请求：`{ model, input: { messages: [{ role: 'user', content: [{ text }] }] }, parameters: { size, n } }`
   * 响应：`output.choices[0].message.content[0].image`（URL），部分模型走 `output.results[0].url`。
   */
  private async generateImageWithDashScope(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    signal: AbortSignal,
    size: string,
  ): Promise<{ buffer: Buffer; width?: number; height?: number }> {
    const origin = safeOrigin(baseUrl) ?? DASHSCOPE_NATIVE_ORIGIN
    const url = `${origin}${DASHSCOPE_IMAGE_GENERATION_PATH}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
        parameters: { size: toDashScopeSize(size), n: 1, watermark: false },
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`百炼生图返回 ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const imageUrl = extractDashScopeImageUrl(data)
    if (!imageUrl) {
      throw new Error(`百炼生图返回里找不到图片地址：${JSON.stringify(data).slice(0, 200)}`)
    }
    return this.downloadImage(imageUrl, signal)
  }

  /** 下载远端图片为 buffer。 */
  private async downloadImage(url: string, signal: AbortSignal): Promise<{ buffer: Buffer }> {
    const imgRes = await fetch(url, { signal })
    if (!imgRes.ok) throw new Error(`下载图片失败: ${imgRes.status}`)
    const arrayBuffer = await imgRes.arrayBuffer()
    return { buffer: Buffer.from(arrayBuffer) }
  }

  /** 存储图片：优先 OSS，回退本地 */
  private async storeImage(
    imageResult: { buffer: Buffer },
    conversationId: string,
  ): Promise<string> {
    // 尝试 OSS
    const ossCfg = await getOssImageConfig()
    if (ossCfg) {
      try {
        const result = await uploadImageToOss(imageResult.buffer, ossCfg)
        if (result.ok) return result.url
        throw new Error(result.error)
      } catch (err) {
        console.error('[image-gen] OSS upload failed, falling back to local:', err)
      }
    }

    // 回退本地存储
    const filename = `generated-${Date.now()}.png`
    const dir = join(process.cwd(), '.agenthub-data', 'generated-images', conversationId)
    mkdirSync(dir, { recursive: true })
    const filepath = join(dir, filename)
    writeFileSync(filepath, imageResult.buffer)
    return `/api/files/generated-images/${conversationId}/${filename}`
  }

  /**
   * 创建 image 类型 artifact。
   *
   * 与 write_artifact 同一套聚合规则：一次任务连续生多张图时合并进同一个「图集」产物
   * （content.images），之后的改稿挂成新版本，产物库里始终是一个交付物。
   */
  private async createImageArtifact(
    conversationId: string,
    agentId: string,
    imageUrl: string,
    alt: string,
    width?: number,
    height?: number,
  ) {
    const now = Date.now()
    const image = {
      url: imageUrl,
      alt: alt.slice(0, 200),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    }
    const decision = await resolveImageArtifactTarget({ conversationId, now })

    if (decision.mode === 'append') {
      // 必须用追加后的 images 回执：decision.target.content 是 append 之前的快照，
      // 直接拿它发 artifact.create 会让前端的图集里缺刚生成的这张图。
      const { images } = await appendImageToArtifact(decision.target, image, now)
      const content = {
        ...(decision.target.content as unknown as Record<string, unknown>),
        images,
      } as ArtifactContent
      return { ...decision.target, content, updatedAt: now }
    }

    const base = {
      id: newArtifactId(),
      conversationId,
      type: 'image' as const,
      title: `生成的图片 · ${alt.slice(0, 30)}`,
      content: {
        type: 'image' as const,
        url: imageUrl,
        alt: alt.slice(0, 200),
        images: [image],
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      },
      createdByAgentId: agentId,
      createdAt: now,
      updatedAt: now,
    }
    const row =
      decision.mode === 'version'
        ? { ...base, version: decision.version, parentArtifactId: decision.parent.id }
        : { ...base, version: 1, parentArtifactId: null }

    await db.insert(schema.artifacts).values(row)
    return row
  }

  private toArtifactRecord(row: {
    id: string
    conversationId: string
    type: string
    title: string
    content: ArtifactContent
    version: number
    parentArtifactId: string | null
    createdByAgentId: string
    createdAt: number
  }): ArtifactRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      type: row.type as ArtifactRecord['type'],
      title: row.title,
      content: row.content,
      version: row.version,
      parentArtifactId: row.parentArtifactId ?? undefined,
      createdByAgentId: row.createdByAgentId,
      createdAt: row.createdAt,
    }
  }

  /** 产出错误消息并结束 run */
  private async *yieldError(
    input: AdapterInput,
    messageId: string,
    errorMsg: string,
  ): AsyncIterable<StreamEvent> {
    const base = { conversationId: input.conversationId, timestamp: Date.now() }
    yield { ...base, type: 'run.start', runId: input.runId, agentId: input.agentId, triggerMessageId: '' }
    yield { ...base, type: 'message.start', messageId, agentId: input.agentId, runId: input.runId }
    yield {
      ...base,
      type: 'part.start',
      messageId,
      partIndex: 0,
      part: { type: 'text', content: errorMsg },
    }
    yield { ...base, type: 'part.end', messageId, partIndex: 0 }
    yield { ...base, type: 'message.end', messageId }
    yield { ...base, type: 'run.end', runId: input.runId, status: 'failed', error: errorMsg }
  }
}

/** 从 baseUrl 里取 origin（`https://host/compatible-mode/v1` → `https://host`）。 */
function safeOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl.trim()).origin
  } catch {
    return null
  }
}

/** `1920*1080` → `{ width: 1920, height: 1080 }`；解析不出返回 null。 */
function parseSizeToPixels(size: string): { width: number; height: number } | null {
  const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(size.trim())
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** 百炼生图响应的图片地址提取（兼容 choices / results 两种形态）。 */
function extractDashScopeImageUrl(data: unknown): string | null {
  const output = (data as { output?: unknown } | null)?.output as
    | {
        choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>
        results?: Array<{ url?: string }>
      }
    | undefined
  if (!output) return null
  const fromChoices = output.choices?.[0]?.message?.content?.find((c) => !!c?.image)?.image
  if (fromChoices) return fromChoices
  const fromResults = output.results?.find((r) => !!r?.url)?.url
  return fromResults ?? null
}
