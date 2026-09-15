import { eq } from 'drizzle-orm'

import { db, schema } from '@/db/client'
import { normalizeModality, type AgentModality } from '@/lib/llm-shared'

/**
 * Agent 团队草稿服务。
 *
 * 根据用户输入的团队目标生成团队结构（名称、目标、成员角色）。
 * 优先用 LLM 动态生成，失败时回退到启发式模板。
 * 用户确认草稿后，UI 会逐个创建 Agent 并关联到团队。
 */

export interface TeamMemberDraft {
  /** 成员显示名（创建 Agent 时用） */
  name: string
  /** 成员头像 emoji；团队里每个成员各不相同，便于在群聊与列表中辨认 */
  avatar: string
  /** 成员在团队中的角色描述 */
  role: string
  /** 推断的模态，用于自动匹配模型 */
  modality: AgentModality
  /** 该成员 Agent 的 system prompt 草稿 */
  systemPrompt: string
  /** 是否为团队负责人 */
  isLead: boolean
}

export interface TeamDraft {
  name: string
  description: string
  goal: string
  members: TeamMemberDraft[]
  rationale: string[]
}

export interface TeamDraftRequest {
  goal: string
}

// ─── LLM 驱动的团队生成 ────────────────────────────────────────

const TEAM_DRAFT_SYSTEM_PROMPT = `你是一个专业的团队组建顾问。根据用户描述的目标，设计一个高效的 Agent 协作团队。

要求：
1. 团队成员 3-6 人，每个成员有明确的角色和职责
2. 第一个成员是团队负责人（isLead: true），负责整体协调和成果汇总
3. 每个成员的 modality 必须是以下之一：code（代码/编程/调试）、text（文本/写作/分析）、vision（识图/视觉理解）、image（生图/设计）
4. 每个成员的 avatar 是一个能体现其角色的 emoji，同一团队内不得重复（负责人建议用 🧭）
5. systemPrompt 要具体描述该成员的职责、工作方式和输出要求，50-150 字
6. 团队名称简洁有力，描述一句话说明团队定位
7. 只输出 JSON，不要任何解释、markdown 标记或前后文本

输出 JSON 格式：
{
  "name": "团队名称",
  "description": "团队描述",
  "members": [
    {
      "name": "成员名称",
      "avatar": "🧭",
      "role": "角色职责",
      "modality": "code|text|vision|image",
      "systemPrompt": "该成员的系统提示词",
      "isLead": true
    }
  ]
}`

/**
 * 用 LLM 生成团队草稿。失败时返回 null，调用方应回退到启发式模板。
 */
export async function createTeamDraftWithLLM(input: TeamDraftRequest): Promise<TeamDraft | null> {
  const goal = input.goal.trim()
  if (!goal) return null

  try {
    // 获取已连接的 deepseek provider
    const provider = await db.query.llmProviders.findFirst({
      where: eq(schema.llmProviders.id, 'deepseek'),
    })
    if (!provider?.apiKey || !provider.isConnected) return null

    const baseUrl = provider.baseUrl || 'https://api.deepseek.com/v1'
    const model = provider.models?.[0] ?? 'deepseek-v4-flash'

    const userPrompt = `请为以下目标设计一个 Agent 协作团队：

目标：${goal}

请输出符合要求的 JSON。`

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TEAM_DRAFT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      console.error('[team-draft] LLM call failed:', res.status, await res.text().catch(() => ''))
      return null
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content || ''
    if (!content) return null

    // 容错解析 JSON
    const parsed = parseTeamDraftJSON(content)
    if (!parsed) return null

    // 验证和修正结构
    const members = normalizeMembers(parsed.members ?? [])
    if (members.length < 2) return null

    return {
      name: parsed.name || '智能协作团队',
      description: parsed.description || '围绕目标组建的协作团队',
      goal,
      members,
      rationale: [
        `由 LLM 根据目标「${goal.slice(0, 30)}${goal.length > 30 ? '…' : ''}」动态生成团队结构`,
        `团队共 ${members.length} 名成员，按模态自动匹配模型`,
        `负责人：${members[0].name}（${members[0].role}）`,
      ],
    }
  } catch (err) {
    console.error('[team-draft] LLM generation error:', err)
    return null
  }
}

/** 从容错文本中提取并解析 JSON */
function parseTeamDraftJSON(content: string): { name?: string; description?: string; members?: Record<string, unknown>[] } | null {
  // 尝试直接解析
  try {
    return JSON.parse(content)
  } catch {
    // 提取 ```json ... ``` 块
    const jsonBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonBlock) {
      try {
        return JSON.parse(jsonBlock[1])
      } catch {
        // 继续尝试其他方式
      }
    }
    // 提取第一个 { 到最后一个 }
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(content.slice(firstBrace, lastBrace + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** 头像兜底池：按成员顺序取用，保证同一团队内互不重复。 */
const ROLE_AVATARS = ['🧭', '📋', '🔍', '🧪', '🎨', '🚀', '🧩', '📊'] as const

/** 验证和修正成员结构 */
function normalizeMembers(raw: Record<string, unknown>[]): TeamMemberDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) return []

  const members: TeamMemberDraft[] = []
  const usedAvatars = new Set<string>()
  for (let i = 0; i < Math.min(raw.length, 6); i++) {
    const m = raw[i]
    if (!m || typeof m !== 'object') continue

    // LLM 仍可能吐出旧的 audio / multimodal，统一归并到现行四类
    const modality = normalizeModality(typeof m.modality === 'string' ? m.modality : undefined)
    members.push({
      name: String(m.name || `成员${i + 1}`).slice(0, 30),
      avatar: pickAvatar(m.avatar, i, usedAvatars),
      role: String(m.role || '').slice(0, 50),
      modality,
      systemPrompt: String(m.systemPrompt || '').slice(0, 300),
      isLead: i === 0 ? true : Boolean(m.isLead),
    })
  }

  // 确保至少有一个负责人
  if (members.length > 0 && !members.some((m) => m.isLead)) {
    members[0].isLead = true
  }

  return members
}

/**
 * 选定成员头像：LLM 给的 emoji 优先，缺失/非法/与队友撞了则从兜底池里取一个没用过的。
 * 目标是一条团队里每个成员的头像都不相同。
 */
function pickAvatar(raw: unknown, index: number, used: Set<string>): string {
  const fromLlm = typeof raw === 'string' ? raw.trim().match(/\p{Extended_Pictographic}/u)?.[0] : undefined
  if (fromLlm && !used.has(fromLlm)) {
    used.add(fromLlm)
    return fromLlm
  }
  for (const candidate of ROLE_AVATARS) {
    if (used.has(candidate)) continue
    used.add(candidate)
    return candidate
  }
  return ROLE_AVATARS[index % ROLE_AVATARS.length]
}

// ─── 启发式模板（LLM 失败时的回退） ────────────────────────────

interface TeamTemplate {
  match: RegExp
  name: string
  description: string
  members: Omit<TeamMemberDraft, 'isLead' | 'avatar'>[]
}

const TEMPLATES: TeamTemplate[] = [
  {
    match: /(产品|app|应用|软件|开发|网站|前端|后端|全栈|程序|功能)/,
    name: '产品开发团队',
    description: '从需求到上线的完整产品开发协作团队',
    members: [
      {
        name: '产品经理',
        role: '需求分析与产品规划',
        modality: 'text',
        systemPrompt:
          '你是产品经理。负责分析用户需求、编写产品需求文档(PRD)、规划功能优先级、协调开发进度。输出结构化的需求文档和用户故事。',
      },
      {
        name: 'UI/UX 设计师',
        role: '界面设计与用户体验',
        modality: 'image',
        systemPrompt:
          '你是 UI/UX 设计师。负责产品界面设计、交互原型、视觉规范。输出设计稿描述、布局方案和设计规范。',
      },
      {
        name: '前端开发',
        role: '前端实现与交互',
        modality: 'code',
        systemPrompt:
          '你是前端开发工程师。负责 Web/移动端界面实现、交互逻辑、性能优化。使用现代前端框架，输出可运行的代码。',
      },
      {
        name: '后端开发',
        role: '服务端与数据',
        modality: 'code',
        systemPrompt:
          '你是后端开发工程师。负责 API 设计、数据库建模、服务端逻辑、部署运维。输出服务端代码和接口文档。',
      },
      {
        name: '测试工程师',
        role: '质量保障与测试',
        modality: 'code',
        systemPrompt:
          '你是测试工程师。负责编写测试用例、执行测试、报告 Bug、验证修复。输出测试报告和质量评估。',
      },
    ],
  },
  {
    match: /(文章|博客|内容|写作|文案|公众号|小红书|新闻|报告)/,
    name: '内容创作团队',
    description: '从选题到成稿的内容生产协作团队',
    members: [
      {
        name: '研究员',
        role: '资料搜集与选题分析',
        modality: 'text',
        systemPrompt:
          '你是研究员。负责搜集资料、分析选题、整理事实和数据。输出结构化的研究笔记和参考资料。',
      },
      {
        name: '撰稿人',
        role: '内容撰写',
        modality: 'text',
        systemPrompt:
          '你是撰稿人。负责根据研究资料撰写文章初稿，把控文章结构和语言风格。输出完整的文章草稿。',
      },
      {
        name: '编辑',
        role: '审稿与润色',
        modality: 'text',
        systemPrompt:
          '你是编辑。负责审稿、润色、校对、把控内容质量和发布标准。输出修改建议和最终定稿。',
      },
      {
        name: '视觉设计师',
        role: '配图与排版',
        modality: 'image',
        systemPrompt:
          '你是视觉设计师。负责文章配图、封面设计、排版美化。输出设计方案和配图描述。',
      },
    ],
  },
  {
    match: /(视频|短片|动画|微电影|宣传片|剪辑|vlog)/,
    name: '视频制作团队',
    description: '从脚本到成片的视频创作协作团队',
    members: [
      {
        name: '编导',
        role: '脚本策划与分镜',
        modality: 'text',
        systemPrompt:
          '你是编导。负责视频选题、脚本撰写、分镜设计、把控整体风格。输出脚本和分镜表。',
      },
      {
        name: '美术指导',
        role: '视觉风格与画面',
        modality: 'image',
        systemPrompt:
          '你是美术指导。负责视频视觉风格、画面构图、色彩方案、素材生成。输出视觉方案和画面描述。',
      },
      {
        name: '音频工程师',
        role: '配音与音效',
        // 没有独立音频能力位，配音稿/音频方案按文本 Agent 匹配模型
        modality: 'text',
        systemPrompt:
          '你是音频工程师。负责配音、背景音乐、音效设计、音频后期。输出音频方案和配音稿。',
      },
      {
        name: '剪辑师',
        role: '剪辑与后期合成',
        // 视频画面处理归入视觉 Agent
        modality: 'vision',
        systemPrompt:
          '你是剪辑师。负责视频剪辑、特效合成、字幕制作、调色输出。输出剪辑方案和成片规格。',
      },
    ],
  },
  {
    match: /(营销|推广|运营|增长|广告|品牌|活动策划)/,
    name: '营销运营团队',
    description: '从策略到执行的营销增长协作团队',
    members: [
      {
        name: '策略总监',
        role: '营销策略与规划',
        modality: 'text',
        systemPrompt:
          '你是营销策略总监。负责市场分析、营销策略、渠道规划、预算分配。输出营销方案和执行计划。',
      },
      {
        name: '内容运营',
        role: '内容生产与分发',
        modality: 'text',
        systemPrompt:
          '你是内容运营。负责各平台内容策划、文案撰写、发布排期、数据分析。输出内容日历和运营方案。',
      },
      {
        name: '创意设计师',
        role: '视觉创意与物料',
        modality: 'image',
        systemPrompt:
          '你是创意设计师。负责营销物料设计、海报、Banner、品牌视觉。输出设计方案和物料清单。',
      },
      {
        name: '数据分析师',
        role: '效果追踪与优化',
        modality: 'code',
        systemPrompt:
          '你是数据分析师。负责营销数据追踪、效果评估、A/B 测试、优化建议。输出数据分析报告。',
      },
    ],
  },
]

const DEFAULT_TEAM: Omit<TeamTemplate, 'match'> = {
  name: '专项协作团队',
  description: '围绕目标组建的通用协作团队',
  members: [
    {
      name: '协调员',
      role: '任务拆解与进度协调',
      modality: 'text',
      systemPrompt:
        '你是团队协调员。负责拆解目标、分配任务、跟踪进度、汇总成果。输出任务清单和进度报告。',
    },
    {
      name: '研究员',
      role: '信息搜集与分析',
      modality: 'text',
      systemPrompt:
        '你是研究员。负责搜集相关信息、分析背景、整理参考资料。输出研究笔记和事实清单。',
    },
    {
      name: '执行者',
      role: '核心产出与交付',
      modality: 'text',
      systemPrompt:
        '你是执行者。负责根据任务要求完成核心产出，确保交付质量。输出最终交付物。',
    },
  ],
}

// ─── 生成团队草稿（统一入口：优先 LLM，回退模板） ─────────────

export async function createTeamDraft(input: TeamDraftRequest): Promise<TeamDraft> {
  // 优先用 LLM
  const llmDraft = await createTeamDraftWithLLM(input)
  if (llmDraft) return llmDraft

  // 回退到启发式模板
  return createTeamDraftHeuristic(input)
}

/** 启发式模板生成（同步，保留给不需要 LLM 的场景） */
export function createTeamDraftHeuristic(input: TeamDraftRequest): TeamDraft {
  const goal = input.goal.trim()
  const lower = goal.toLowerCase()

  const template = TEMPLATES.find((t) => t.match.test(lower)) ?? DEFAULT_TEAM

  // 模板未指定头像，按角色补一个专属 emoji（同模板内不重复）
  const members: TeamMemberDraft[] = template.members.map((m, i) => ({
    ...m,
    avatar: ROLE_AVATARS[i % ROLE_AVATARS.length],
    isLead: i === 0,
  }))

  // 用目标关键词定制团队名
  const name = customizeName(template.name, goal)

  return {
    name,
    description: template.description,
    goal,
    members,
    rationale: [
      `根据目标「${goal.slice(0, 30)}${goal.length > 30 ? '…' : ''}」匹配到「${template.name}」模板`,
      `团队共 ${members.length} 名成员，按模态自动匹配模型`,
      `负责人：${members[0].name}（${members[0].role}）`,
    ],
  }
}

function customizeName(baseName: string, goal: string): string {
  // 从目标中提取前 8 个字符作为团队名后缀
  const short = goal.replace(/[，。！？、；：""''（）\s]/g, '').slice(0, 8)
  return short ? `${baseName}·${short}` : baseName
}

/** 列出所有可用的团队模板（UI 展示用） */
export function listTeamTemplates(): Array<{ name: string; description: string; memberCount: number }> {
  return [
    ...TEMPLATES.map((t) => ({ name: t.name, description: t.description, memberCount: t.members.length })),
    { name: DEFAULT_TEAM.name, description: DEFAULT_TEAM.description, memberCount: DEFAULT_TEAM.members.length },
  ]
}
