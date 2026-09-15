import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { buildArtifactContent, describeArtifactContentError } from '@/server/artifact-content'
import { appendImageToArtifact, resolveImageArtifactTarget } from '@/server/artifact-image-group'
import { recordRunArtifact } from '@/server/dispatch-run-evidence'
import { ensureImageStored } from '@/server/oss-image-store'
import { newArtifactId } from '@/server/ids'

import type { ArtifactType } from '@/shared/types'
import type { ToolDef } from './types'

/**
 * write_artifact —— 创建产物，或基于已有 artifactId 创建新版本（version 自增）。
 *
 * 用法：
 *  - 全新产物：传 type / title / content
 *  - 修改已有产物：额外传 parentArtifactId，新 row 的 version = parent.version + 1，
 *    parentArtifactId 链接父行；ArtifactPreviewPanel 的版本切换器据此构造版本链
 *
 * 图片产物会自动聚合：一次任务里连续产出的多张图合并进同一个产物的 content.images
 * （产物库里是 1 张「N 张图」的卡片，不是 N 张碎片）；之后同一会话内再次出图则在上一个
 * 版本上继续（version+1）。详见 @/server/artifact-image-group。
 *
 * 仅写入 DB 并返回 artifactId；不直接发布 artifact.create 事件。Adapter 在 tool.result
 * 之后检测到返回值里的 artifactId 会统一发 artifact.create，AgentRunner 再注入
 * artifact_ref part 到当前 message。这样保证事件流的单一来源（来自 adapter）。
 *
 * 内容规整逻辑 buildArtifactContent 抽到 @/server/artifact-content，与用户面板的
 * createArtifactVersion 共用（单一校验来源）。
 */

const ArgsSchema = z.object({
  type: z.enum(['web_app', 'document', 'image', 'ppt', 'diagram']),
  title: z.string().min(1),
  content: z.unknown(),
  outputKey: z.string().min(1).optional(),
  /** 可选：已有产物的 id，传则创建该产物的新版本（version+1，parentArtifactId 链接） */
  parentArtifactId: z.string().optional(),
})

export const writeArtifactTool: ToolDef = {
  name: 'write_artifact',
  description:
    'Create a new artifact, or a new version of an existing one. Never call with empty args: type, title, and content are required in the same tool call. Pass parentArtifactId to create a version that links to the prior; version auto-increments. Use this to produce code/web/docs/images/PPT decks/diagrams that the user can preview.',
  parameters: {
    type: 'object',
    required: ['type', 'title', 'content'],
    properties: {
      type: {
        type: 'string',
        enum: ['web_app', 'document', 'image', 'ppt', 'diagram'],
        description:
          'web_app for HTML/CSS/JS bundles, document for markdown text, image for URL / data URI / workspace-relative file path, ppt for slide decks (structured JSON, exportable to a real .pptx), diagram for Mermaid diagrams',
      },
      title: { type: 'string', description: 'Short human-readable title' },
      content: {
        type: 'object',
        description:
          'Artifact body — pass as a JSON OBJECT, do NOT JSON-stringify it into a quoted string. For web_app: { files: { "index.html": "...", "style.css"?, "script.js"? }, entry: "index.html" }. For document: { format: "markdown", content: "...markdown text..." }. For image: { url: "...", alt: "..." } — url may be an http(s) URL, a data URI, or a path relative to the workspace root for a file you already generated (e.g. "scene_assets/hero.png"); workspace paths get copied into artifact storage so the preview keeps working. For diagram: { syntax: "mermaid", source: "flowchart TD\\nA[\\"中文 / formula O(N^2)\\"] --> B[\\"结果\\"]", theme?: "default"|"base"|"dark"|"forest"|"neutral" }. Diagram source is preflighted: quote labels with Chinese/math/symbols as A["..."], use one edge per line, omit ```mermaid fences, and if the tool returns Invalid Mermaid diagram, fix source and call again. For ppt: { title?, theme?: { primary?: "1A3C6E", background?: "F8F9FA", surface?: "FFFFFF", textBody?: "2C3E50", textMuted?: "95A5A6", accentPositive?: "2B7A4B", accentNegative?: "C0392B", divider?: "E0E4E8", fontHeading?: "Inter", fontBody?: "Inter" }, slides: [{ title?, subtitle?, layout?: "title"|"title-bullets"|"section"|"blank"|"content"|"two-column"|"metrics"|"timeline"|"quote", blocks?: [{ type: "heading", text, level? }, { type: "paragraph", text }, { type: "bullets", items, ordered? }, { type: "metric", label, value, change?, tone? }, { type: "quote", text, attribution? }, { type: "timeline", items: [{ label, title?, text? }] }, { type: "columns", columns: [{ title?, blocks: [{ type: "paragraph"|"bullets"|"metric"|"callout", ... }] }] }, { type: "callout", title?, text, tone? }, { type: "divider" }, { type: "spacer", size? }], notes? }] }. Legacy slides with bullets are still accepted, but prefer blocks for polished decks. Hex colors have no "#"; ppt JSON must not embed raw base64/data URI assets. Common mistake to avoid: sending content as a string like "{\\"format\\":\\"markdown\\",...}" — send the raw object, not its JSON text.',
      },
      parentArtifactId: {
        type: 'string',
        description:
          'Optional: id of an existing artifact to base a new version on. When provided, the new row links to it and version increments from the parent.',
      },
      outputKey: {
        type: 'string',
        description:
          'Optional Orchestrator handoff key. When your task declares expectedOutputs, pass the matching expectedOutputs.id so downstream tasks can consume this artifact reliably.',
      },
    },
  },
  async handler(args, ctx) {
    if (isEmptyObject(args)) {
      return {
        ok: false,
        error:
          'write_artifact requires complete args in one call: type, title, and content. Example document call: write_artifact({ type: "document", title: "UI Style Guide", content: { format: "markdown", content: "# UI Style Guide\\n..." } }). Do not call write_artifact with {} or try to provide arguments in plain text.',
      }
    }

    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const { type, title, content, parentArtifactId, outputKey } = parsed.data
    const fullContent = buildArtifactContent(type, content)
    if (!fullContent) {
      return {
        ok: false,
        error: describeArtifactContentError(type, content) ?? `Invalid content for type ${type}`,
      }
    }

    let version = 1
    let resolvedParent: string | null = null
    if (parentArtifactId) {
      const parent = await db.query.artifacts.findFirst({
        where: eq(schema.artifacts.id, parentArtifactId),
      })
      if (!parent) {
        return { ok: false, error: `parentArtifactId not found: ${parentArtifactId}` }
      }
      if (parent.conversationId !== ctx.conversationId) {
        return { ok: false, error: 'parentArtifactId belongs to a different conversation' }
      }
      version = parent.version + 1
      resolvedParent = parent.id
    } else if (ctx.taskId && type !== 'image') {
      // 派单子任务的重做兜底：agent 没主动传 parentArtifactId 时，把同标题同类型的
      // 再次交付自动挂成新版本，避免验收重试堆出一串独立产物。详见 findRedeliveryParent。
      //
      // 跳过 image：图片走 artifact-image-group 的图集聚合（同批次追加 / 近 6 小时
      // 建新版本），语义比「标题相同即新版本」更准 —— 在这里抢先设 resolvedParent
      // 会让「一次任务出多张图合成一个图集」退化成一串独立版本。
      const redelivery = await findRedeliveryParent({
        conversationId: ctx.conversationId,
        agentId: ctx.agentId,
        type,
        title,
        now: Date.now(),
      })
      if (redelivery) {
        version = redelivery.version + 1
        resolvedParent = redelivery.id
      }
    }

    const artifactId = newArtifactId()
    const createdAt = Date.now()
    let mergedIntoGallery = false

    // 图片产物统一存储：已配置 OSS → 上传 OSS（稳定远程，不落本地）；否则本地化兜底。
    // 传 ctx.workspacePath 是为了收编「agent 拿工作区文件路径当 url」的常见写法
    // （scene_assets/x.png、或模仿前缀的 /api/artifact-images/x.jpg）—— 不收编就是裂图。
    if (fullContent.type === 'image') {
      const stored = await ensureImageStored(fullContent.url, ctx.workspacePath)
      if (stored.ok) {
        fullContent.url = stored.url
      } else if (isNonUrlImageSource(fullContent.url)) {
        // 既不是 URL、工作区里也找不到 → 别静默落库成裂图，直接把问题交回给 agent
        return {
          ok: false,
          error:
            `image url "${String(fullContent.url).slice(0, 120)}" is neither a fetchable URL nor an existing file in the workspace. ` +
            `Pass one of: an http(s) image URL, a data URI, or a path relative to the workspace root that actually exists. ` +
            `Workspace root: ${ctx.workspacePath}. Detail: ${stored.error}`,
        }
      } else {
        console.warn(`[write-artifact] image store failed (${stored.error}); keep original url`)
      }
    }

    // 图片产物聚合：未显式指定 parent 时，按「同批次追加 / 近 6 小时建新版本」归拢。
    if (fullContent.type === 'image' && !resolvedParent) {
      const decision = await resolveImageArtifactTarget({
        conversationId: ctx.conversationId,
        now: createdAt,
      })
      if (decision.mode === 'append') {
        const image = {
          url: fullContent.url,
          alt: fullContent.alt,
          ...(fullContent.width ? { width: fullContent.width } : {}),
          ...(fullContent.height ? { height: fullContent.height } : {}),
        }
        const { images } = await appendImageToArtifact(decision.target, image, createdAt)
        mergedIntoGallery = true
        // 产物也要计入 run 的验收证据：只认 fs_write 会让「bash 生成 + write_artifact 交付」
        // 的任务永远过不了 targetPaths 门禁。详见 dispatch-run-evidence 的注释。
        recordRunArtifact(ctx.runId, {
          artifactId: decision.target.id,
          title: decision.target.title,
          type,
          version: decision.target.version,
        })
        return {
          ok: true,
          value: {
            artifactId: decision.target.id,
            title: decision.target.title,
            type,
            version: decision.target.version,
            parentArtifactId: decision.target.parentArtifactId,
            // 告诉 Agent 这张图被并进了图集——它不必（也不该）为每张图单独起名
            mergedIntoGallery: true,
            imageCount: images.length,
            ...(outputKey ? { outputKey } : {}),
          },
        }
      }
      if (decision.mode === 'version') {
        resolvedParent = decision.parent.id
        version = decision.version
      }
    }

    await db.insert(schema.artifacts).values({
      id: artifactId,
      conversationId: ctx.conversationId,
      type,
      title,
      content: fullContent,
      version,
      parentArtifactId: resolvedParent,
      createdByAgentId: ctx.agentId,
      createdAt,
      updatedAt: createdAt,
    })

    // 产物也要计入 run 的验收证据：只认 fs_write 会让「bash 生成 + write_artifact 交付」
    // 的任务永远过不了 targetPaths 门禁。详见 dispatch-run-evidence 的注释。
    recordRunArtifact(ctx.runId, { artifactId, title, type, version })

    return {
      ok: true,
      value: {
        artifactId,
        title,
        type,
        version,
        parentArtifactId: resolvedParent,
        ...(mergedIntoGallery ? { mergedIntoGallery: true } : {}),
        ...(outputKey ? { outputKey } : {}),
      },
    }
  },
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

/**
 * 重做幂等窗口。窗口内、同 agent、同 type、同标题的再次交付视为「改稿」。
 *
 * 为什么需要：验收门禁不通过时 runChildTask 会重试（最多 MAX_CHILD_TASK_ATTEMPTS 次），
 * 重试仍失败会进 Orchestrator 补救轮（最多 MAX_DISPATCH_ROUNDS 轮）—— 每一轮都是
 * 一次全新的子 agent 执行，而 write_artifact 默认每次都 `newArtifactId()`。
 * 于是同一个交付物被反复重做，产物库里堆出一串同标题的独立卡片（不是版本链），
 * 用户看到的是「Agent 疯狂刷产物」。提示词里已经要求 agent 传 parentArtifactId，
 * 但那是软约束，LLM 重试时经常不遵守 —— 这里是服务端的硬兜底。
 *
 * 只在派单子任务（ctx.taskId 有值）里生效：顶层自由对话不受影响，
 * 避免把用户主动创建的多个同名产物误合并成一串版本。
 */
const REDELIVERY_WINDOW_MS = 30 * 60_000

async function findRedeliveryParent(args: {
  conversationId: string
  agentId: string
  type: ArtifactType
  title: string
  now: number
}): Promise<{ id: string; version: number } | null> {
  const rows = await db.query.artifacts.findMany({
    where: and(
      eq(schema.artifacts.conversationId, args.conversationId),
      eq(schema.artifacts.createdByAgentId, args.agentId),
      eq(schema.artifacts.type, args.type),
      eq(schema.artifacts.title, args.title),
    ),
    columns: { id: true, version: true, createdAt: true },
    orderBy: [desc(schema.artifacts.createdAt)],
    limit: 5,
  })
  const latest = rows.find((row) => args.now - row.createdAt <= REDELIVERY_WINDOW_MS)
  return latest ? { id: latest.id, version: latest.version } : null
}

/**
 * 判断图片 url 是不是「本来就该能直接访问」的来源之外的东西 —— 即看起来像文件路径的。
 * 这类值若存不下来，说明路径写错了，应该报错而不是当作可用的 URL 落库。
 */
function isNonUrlImageSource(url: string): boolean {
  const value = url.trim()
  if (!value) return true
  if (/^https?:\/\//i.test(value)) return false
  if (value.startsWith('data:')) return false
  return true
}
