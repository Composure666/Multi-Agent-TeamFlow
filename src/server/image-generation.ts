import {
  DASHSCOPE_IMAGE_GENERATION_PATH,
  DASHSCOPE_NATIVE_ORIGIN,
  resolveImageApiProtocol,
  toDashScopeSize,
} from '@/lib/llm-shared'

/**
 * 生图调用（协议层）—— 唯一真相源。
 *
 * 两套互不兼容的生图协议，按 Base URL 自动选：
 * - 阿里云百炼原生 `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
 *   （百炼的 OpenAI 兼容层**没有** `/images/generations`，实测 404）；
 * - 其它网关（SiliconFlow 等）的 OpenAI 兼容 `POST {baseUrl}/images/generations`。
 *
 * 为什么单独成模块：调用方有两处，且都必须走同一套协议细节 ——
 *   1. `ImageGenAdapter`（模型本身就是生图模型，整轮 run 就是出图）；
 *   2. `image_generate` 工具（任何工具型成员按需出图，模型是 chat 模型）。
 * 两处各写一遍的结果是「适配器能出图、工具出不了」这类漂移，历史上踩过。
 */

export interface ImageGenerationRequest {
  apiBaseUrl: string
  apiKey: string
  modelId: string
  prompt: string
  /** OpenAI 风格尺寸（`1024x1024` / `1920*1080` 均可），按协议转换后发出。 */
  size: string
  signal?: AbortSignal
}

/**
 * 调一次生图端点，返回图片字节流。
 *
 * 不在这里做修边 / 落盘 / 存储 —— 那是交付层的事（见 `@/server/image-delivery`
 * 与 `ensureImageStored`）。本函数只管「把图要回来」。
 */
export async function generateImageBuffer(req: ImageGenerationRequest): Promise<Buffer> {
  const { apiBaseUrl, apiKey, modelId, prompt, size, signal } = req
  if (resolveImageApiProtocol(apiBaseUrl) === 'dashscope') {
    return generateWithDashScope({ apiBaseUrl, apiKey, modelId, prompt, size, signal })
  }
  return generateWithOpenAiCompatible({ apiBaseUrl, apiKey, modelId, prompt, size, signal })
}

async function generateWithOpenAiCompatible(req: ImageGenerationRequest): Promise<Buffer> {
  const { apiBaseUrl, apiKey, modelId, prompt, size, signal } = req
  const url = `${apiBaseUrl.replace(/\/$/, '')}/images/generations`

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

  const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const first = data?.data?.[0]
  if (!first) throw new Error('生图 API 返回为空')

  if (first.b64_json) return Buffer.from(first.b64_json, 'base64')
  if (first.url) return downloadImage(first.url, signal)
  throw new Error('生图 API 返回格式不支持（需要 url 或 b64_json）')
}

/**
 * 百炼原生生图端点。
 *
 * 请求：`{ model, input: { messages: [{ role: 'user', content: [{ text }] }] }, parameters: { size, n } }`
 * 响应：`output.choices[0].message.content[0].image`（URL），部分模型走 `output.results[0].url`。
 */
async function generateWithDashScope(req: ImageGenerationRequest): Promise<Buffer> {
  const { apiBaseUrl, apiKey, modelId, prompt, size, signal } = req
  const origin = safeOrigin(apiBaseUrl) ?? DASHSCOPE_NATIVE_ORIGIN
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
  return downloadImage(imageUrl, signal)
}

async function downloadImage(url: string, signal?: AbortSignal): Promise<Buffer> {
  const imgRes = await fetch(url, { signal })
  if (!imgRes.ok) throw new Error(`下载图片失败: ${imgRes.status}`)
  return Buffer.from(await imgRes.arrayBuffer())
}

/** 从 baseUrl 里取 origin（`https://host/compatible-mode/v1` → `https://host`）。 */
function safeOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl.trim()).origin
  } catch {
    return null
  }
}

/** 百炼生图响应的图片地址提取（兼容 choices / results 两种形态）。 */
export function extractDashScopeImageUrl(data: unknown): string | null {
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
