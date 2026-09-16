import { DEFAULT_IMAGE_SIZE } from '@/lib/llm-shared'
import { upsertImageArtifact } from '@/server/artifact-image-group'
import { storeGeneratedImage } from '@/server/generated-image-store'
import {
  extractImagePromptText,
  normalizeImageSize,
  readImagePixelSize,
  writeImageIntoWorkspace,
} from '@/server/image-delivery'
import { generateImageBuffer } from '@/server/image-generation'
import { newMessageId } from '@/server/ids'
import { runWithFailover } from '@/server/llm-failover'
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
          generateImageBuffer({
            apiBaseUrl: candidate.apiBaseUrl as string,
            apiKey: candidate.apiKey,
            modelId: candidate.modelId,
            prompt,
            size: requestedSize,
            signal,
          }),
        {
          capabilityKey: input.failoverCapabilityKey ?? 'agent:image',
          signal,
          canSwitch: () => true,
        },
      )
      const generatedBuffer = generated.value
      const usedModel = generated.candidate.modelId
      // 模型输出网格是 64 的倍数（请求 1920×1080 实得 1920×1088），交付前居中修边到请求尺寸，
      // 让落盘文件 / 产物记录 / 验收判据三者说的是同一个尺寸。
      const normalized = normalizeImageSize(generatedBuffer, requestedSize)
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

      // 存储：配了 OSS 就上传（稳定远程地址），否则本地化到 artifact-images 目录。
      // 与 write_artifact / image_generate 工具走同一条链路，避免本地回退指向不存在的路由。
      const stored = await storeGeneratedImage(deliveredBuffer, input.workspacePath)
      if (!stored.ok) {
        throw new Error(
          `图片已生成但存储失败（${stored.error}）—— 产物无法交付。` +
            '请检查「设置-供应商」里的 OSS 配置，或确认数据目录可写。',
        )
      }
      const imageUrl = stored.url

      // 创建 artifact（与 image_generate 工具共用同一个图集写入口）
      const artifact = await upsertImageArtifact({
        conversationId: input.conversationId,
        agentId: input.agentId,
        imageUrl,
        alt: prompt,
        ...(pixels ? { width: pixels.width, height: pixels.height } : {}),
        now: Date.now(),
      })

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

/** `1920*1080` → `{ width: 1920, height: 1080 }`；解析不出返回 null。 */
function parseSizeToPixels(size: string): { width: number; height: number } | null {
  const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(size.trim())
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}
