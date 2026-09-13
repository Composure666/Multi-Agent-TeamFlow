import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import { newArtifactId, newMessageId } from '@/server/ids'
import { getOssImageConfig, uploadImageToOss } from '@/server/oss-image-store'
import type { ArtifactRecord, StreamEvent } from '@/shared/types'

import type { AdapterInput, AgentPlatformAdapter } from './types'

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
 */
export class ImageGenAdapter implements AgentPlatformAdapter {
  readonly name = 'image-gen' as const

  async *stream(input: AdapterInput, signal: AbortSignal): AsyncIterable<StreamEvent> {
    const messageId = newMessageId()
    const base = { conversationId: input.conversationId, timestamp: Date.now() }

    // 校验配置
    if (!input.apiKey) {
      yield* this.yieldError(input, messageId, '生图 Agent 需要配置 API Key，请在 Agent 设置中填写。')
      return
    }
    if (!input.apiBaseUrl) {
      yield* this.yieldError(input, messageId, '生图 Agent 需要配置 API Base URL，请在 Agent 设置中填写。')
      return
    }
    if (!input.modelId) {
      yield* this.yieldError(input, messageId, '生图 Agent 需要配置模型 ID，请在 Agent 设置中填写。')
      return
    }

    yield { ...base, type: 'run.start', runId: input.runId, agentId: input.agentId, triggerMessageId: '' }
    yield { ...base, type: 'message.start', messageId, agentId: input.agentId, runId: input.runId }

    // 提取生图 prompt（直接用外层拼好的 prompt，生图模型能处理长描述）
    const prompt = this.extractImagePrompt(input.prompt)

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
      // 调用生图 API
      const imageResult = await this.generateImage(
        input.apiBaseUrl,
        input.apiKey,
        input.modelId,
        prompt,
        signal,
      )

      // 上传到 OSS（如果配置了），否则存本地
      const imageUrl = await this.storeImage(imageResult, input.conversationId)

      // 创建 artifact
      const artifact = await this.createImageArtifact(
        input.conversationId,
        input.agentId,
        imageUrl,
        prompt,
        imageResult.width,
        imageResult.height,
      )

      // 更新 text part 为完成描述
      yield {
        ...base,
        type: 'part.delta',
        messageId,
        partIndex: textPartIndex,
        delta: { type: 'text.append', text: `\n\n图片已生成并保存为产物。` },
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

  /** 从完整 prompt 中提取生图描述（去掉系统提示部分） */
  private extractImagePrompt(fullPrompt: string): string {
    // 简单策略：取 prompt 的最后 500 字符作为生图描述
    // （外层 prompt 通常包含系统提示 + 用户消息，用户消息在末尾）
    const cleaned = fullPrompt.replace(/<[^>]+>/g, '').trim()
    return cleaned.slice(-500) || fullPrompt.slice(-500)
  }

  /** 调用 OpenAI 兼容的 /images/generations */
  private async generateImage(
    baseUrl: string,
    apiKey: string,
    modelId: string,
    prompt: string,
    signal: AbortSignal,
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
        size: '1024x1024',
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
      const imgRes = await fetch(first.url, { signal })
      if (!imgRes.ok) throw new Error(`下载图片失败: ${imgRes.status}`)
      const arrayBuffer = await imgRes.arrayBuffer()
      return { buffer: Buffer.from(arrayBuffer) }
    }

    throw new Error('生图 API 返回格式不支持（需要 url 或 b64_json）')
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

  /** 创建 image 类型 artifact */
  private async createImageArtifact(
    conversationId: string,
    agentId: string,
    imageUrl: string,
    alt: string,
    width?: number,
    height?: number,
  ) {
    const id = newArtifactId()
    const now = Date.now()
    const content = {
      type: 'image' as const,
      url: imageUrl,
      alt: alt.slice(0, 200),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    }

    const row = {
      id,
      conversationId,
      type: 'image' as const,
      title: `生成的图片 · ${alt.slice(0, 30)}`,
      content,
      version: 1,
      parentArtifactId: null,
      createdByAgentId: agentId,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(schema.artifacts).values(row)
    return row
  }

  private toArtifactRecord(row: {
    id: string
    conversationId: string
    type: string
    title: string
    content: any
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
      content: row.content as any,
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
