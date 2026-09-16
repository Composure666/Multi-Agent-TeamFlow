/**
 * LLM 相关的纯类型 + 常量（不依赖 db / better-sqlite3）。
 *
 * Client Component 只能从这里 import，不能从 @/server/*-service import，
 * 因为 service 文件顶部 import 了 db（better-sqlite3 → fs），会被打包到浏览器。
 */
import type { ModelProvider } from '@/shared/types'

export type ProviderType = 'anthropic' | 'openai' | 'deepseek' | 'ark' | 'custom'

/**
 * llm_providers.id → 运行时 ModelProvider（`agents.model_provider` 那一套）。
 *
 * 供应商列表里的四个内置 id 与 ModelProvider 基本同名，只有 ark ↔ volcano-ark 要换名；
 * 其余（含自定义供应商，如百炼）一律走 openai-compatible 协议。
 */
export function providerIdToModelProvider(providerId: string | null | undefined): ModelProvider {
  if (providerId === 'ark') return 'volcano-ark'
  if (providerId === 'anthropic' || providerId === 'openai' || providerId === 'deepseek') return providerId
  return 'openai-compatible'
}

/** 内置供应商的默认配置（Base URL + 常用模型）。 */
export const BUILTIN_PROVIDERS: Record<
  string,
  { providerType: ProviderType; displayName: string; baseUrl?: string; models: string[] }
> = {
  anthropic: {
    providerType: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-7', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  openai: {
    providerType: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'],
  },
  deepseek: {
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-v4'],
  },
  ark: {
    providerType: 'ark',
    displayName: 'Volcano Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-1-5-pro-32k', 'doubao-1-5-lite-32k'],
  },
}

export const BUILTIN_PROVIDER_IDS = Object.keys(BUILTIN_PROVIDERS)

// ─── 阿里云百炼（DashScope）──────────────────────────────────────
//
// 接入点：OpenAI 兼容 `https://dashscope.aliyuncs.com/compatible-mode/v1`
// （生图另有原生 `multimodal-generation` 协议，见 DASHSCOPE_NATIVE_* 常量）。
//
// 这里只放「精选」模型：全部经过真实调用实测（chat + tools + stream + vision + 生图），
// 覆盖 通用 / 代码 / 视觉 / 生图 / 长文本 / 异构第三方 / 深度推理 七类，避免把 250+
// 个模型全塞进下拉框。取舍依据见 docs/model-assignment.md。

export const BAILIAN_PROVIDER_ID = 'bailian'
export const BAILIAN_PROVIDER_DISPLAY_NAME = '阿里云百炼'
export const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** 生图 Agent 的默认模型（快、便宜，适合迭代试稿）。 */
export const DEFAULT_IMAGE_MODEL = 'z-image-turbo'

/**
 * 生图请求的默认尺寸，写法为 **DashScope 风格 `W*H`**。
 *
 * 项目里「归一后的尺寸字符串」一律是这个形态（见 `image-delivery` 的 `RATIO_SIZES` 与
 * `extractRequestedImageSize`）。发出前由 `image-generation` 按协议转换：百炼原生要 `*`，
 * OpenAI 兼容要 `x` —— 所以调用方不必关心自己拿到的是哪种写法。
 *
 * 三处共用同一份常量，避免「适配器默认 1024、工具默认 512」这类口径漂移：
 * image-gen 适配器（交付契约没给尺寸时）、image_generate 工具、以及依赖它们的测试。
 */
export const DEFAULT_IMAGE_SIZE = '1024*1024'

/** 生图（DashScope 原生协议）：OpenAI 兼容的 /images/generations 在此接入点下不存在。 */
export const DASHSCOPE_NATIVE_ORIGIN = 'https://dashscope.aliyuncs.com'

/**
 * DashScope 原生「多模态生成」端点。
 *
 * 生图与联网搜索都走这一个端点（参数与响应结构按业务区分）：
 * - 生图：`parameters` 传 size/prompt，读 `output.choices[0].message.content[0].image`
 * - 搜索：`parameters.enable_search + search_options.enable_source`，读 `output.search_info.search_results[]`
 */
export const DASHSCOPE_MULTIMODAL_GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation'
/** 与 DASHSCOPE_MULTIMODAL_GENERATION_PATH 同一端点；保留此名以兼容既有生图引用。 */
export const DASHSCOPE_IMAGE_GENERATION_PATH = DASHSCOPE_MULTIMODAL_GENERATION_PATH

export type ImageApiProtocol = 'dashscope' | 'openai-compatible'

/** 该 Base URL 是否指向阿里云百炼（DashScope）。原生能力（生图 / 联网搜索）只在它上面可用。 */
export function isDashScopeBaseUrl(baseUrl: string | null | undefined): boolean {
  const raw = baseUrl?.trim()
  if (!raw) return false
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host === 'dashscope.aliyuncs.com' || host.endsWith('.dashscope.aliyuncs.com')
  } catch {
    // 非法 URL 交给下游按 OpenAI 兼容处理，报错信息更贴近用户输入
    return false
  }
}

/**
 * 判断一个 Base URL 该走哪套生图协议。
 *
 * 百炼（dashscope.aliyuncs.com）的 OpenAI 兼容层**没有** `/images/generations`（实测 404），
 * 生图要走原生 `multimodal-generation/generation`；其它网关（SiliconFlow 等）仍是 OpenAI 兼容协议。
 */
export function resolveImageApiProtocol(baseUrl: string | null | undefined): ImageApiProtocol {
  return isDashScopeBaseUrl(baseUrl) ? 'dashscope' : 'openai-compatible'
}

/** OpenAI 风格的 `1024x1024` → DashScope 原生要求的 `1024*1024`。 */
export function toDashScopeSize(size: string): string {
  return size.trim().replace(/x/gi, '*')
}

/**
 * 百炼「生图」分组模型（与 BAILIAN_MODELS 里的注释分组同源）。
 *
 * 生图与 chat 是**两套互不兼容的协议**，两端都会拒：
 * - chat 模型发到原生 `multimodal-generation` 端点 → HTTP 400「url error」；
 * - 生图模型发到 chat completions → 网关按模型路由到生图处理器，回
 *   `Input should be 'user': input.messages.0.role`。
 * 且两种错都属于「不该触发降级」的参数/业务错，一旦把错的模型放在链首，
 * 每一次调用都会先撞一次、整个 run 当场结束 —— 所以需要一个可复用的判据。
 */
export const BAILIAN_IMAGE_MODELS = ['z-image-turbo', 'qwen-image-3.0', 'qwen-image-3.0-pro'] as const

/** 生图模型的命名特征（覆盖第三方网关：flux / sd / dall-e / t2i / wanx 等）。 */
const IMAGE_MODEL_PATTERN =
  /(^|[/_-])(z-image|qwen-image|flux|stable-diffusion|sdxl|dall-e|dall·e|gpt-image|image-gen|ideogram|recraft|kolors|t2i|wanx|wan2)([/_.-]|$)/i

/**
 * 该模型名是否「可识别为生图模型」。
 *
 * 只认得出明确特征的名字；**认不出时返回 false，调用方必须按「不确定」处理**
 * （不要据此断言它是 chat 模型）。生图相关的选路逻辑都遵循这个保守方向。
 */
export function isImageGenerationModel(modelId: string | null | undefined): boolean {
  const id = modelId?.trim()
  if (!id) return false
  if ((BAILIAN_IMAGE_MODELS as readonly string[]).includes(id)) return true
  return IMAGE_MODEL_PATTERN.test(id)
}

/**
 * 该 Agent 是否应该走 image-gen 适配器。
 *
 * 判据是「自有模型是不是生图模型」，**与 modality 无关** —— 决定请求协议的是模型，
 * 不是成员分类。registry 的运行时纠偏、bootstrap 的存量修复、agent-service 的创建/编辑
 * 不变式、llm-failover 的候选链过滤，四处共用这一个函数，避免口径漂移。
 *
 * 2026-09-16 的事故：曾用「modality === 'image' ⇒ 强制 image-gen 适配器 + 清空工具集」
 * 作为不变式，结果把一批「chat 模型 + 工具循环」的视觉生产成员（生图师 / 视觉设计师 /
 * 图表设计师 / 主图设计师）改成了只能出栅格图的成员 —— 它们原本靠 bash / fs_write /
 * write_artifact 自己产 SVG 图、自己写脚本调外部生图服务，能力被砍窄而不是增强。
 *
 * 判据刻意保守：`isImageGenerationModel` 认不出模型名时返回 false，此时调用方应
 * **保持用户显式选择的适配器**，不做任何改写（认不出 ≠ 是 chat 模型）。
 */
export function shouldUseImageGenAdapter(modelId: string | null | undefined): boolean {
  return isImageGenerationModel(modelId)
}

/**
 * 联网搜索（web_search 工具）使用的检索模型。
 *
 * 只负责「拿检索资料 + 组织摘要」，能力由 DashScope 侧注入的搜索结果决定，
 * 因此选便宜的 flash 档；换模型时只需要保证它支持 `enable_search`。
 */
export const BAILIAN_SEARCH_MODEL = 'qwen3.8-flash'

/**
 * 精选模型清单（也是「设置-模型分配」下拉框里百炼供应商的候选模型）。 */
export const BAILIAN_MODELS = [
  // 通用文本
  'qwen3.8-flash',
  'qwen3.8-max',
  'qwen3.7-flash',
  // 第三方异构骨干（补同源失效风险）
  'glm-5.3',
  'kimi-k3',
  // 代码
  'qwen3-coder-plus',
  'qwen3-coder-flash',
  'kimi-k2.7-code',
  // 视觉
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'qwen3.5-ocr',
  // 生图
  'z-image-turbo',
  'qwen-image-3.0',
  'qwen-image-3.0-pro',
  // 长文本 / 深度推理 / 翻译
  'qwen-long',
  'qwen3.5-397b-a17b',
  'qwq-plus',
  'qwen-mt-plus',
] as const

/** 精选模型的差异化定位（UI/文档共用的一份说明，避免两处各写一遍）。 */
export const BAILIAN_MODEL_NOTES: Record<string, string> = {
  'qwen3.8-flash': '新一代通用主力：中文指令跟随与工具调用稳定性优于同级 flash，延迟与 deepseek-v4-flash 持平',
  'qwen3.8-max': '旗舰通用：复杂规划 / 长链路推理，用于 Orchestrator 拆解等高质量场景',
  'qwen3.7-flash': '上一代通用轻量款：作为 3.8-flash 的降级备选，避免单一版本故障',
  'glm-5.3': '智谱异构骨干：与通义/DeepSeek 不同源，用于系统级对话，降低同一供应商集体失效风险',
  'kimi-k3': '长上下文写作 / 资料综述：256K 上下文，长文档凝练能力强',
  'qwen3-coder-plus': '代码旗舰：仓库级理解、多轮工具链稳定，适合 refactor / debug',
  'qwen3-coder-flash': '代码高性价比：延迟约为 coder-plus 的 1/2，适合批量改动与代码解释',
  'kimi-k2.7-code': '代码异构备选：换家族换思路，用于主代码模型结论可疑时的二次验证',
  'qwen3-vl-plus': '视觉旗舰：截图 / 设计稿 / 图表理解，deepseek-v4-flash 完全不支持的模态',
  'qwen3-vl-flash': '视觉高性价比：延迟 ~0.4s，适合大批量截图与页面巡检',
  'qwen3.5-ocr': 'OCR 专项：票据 / 扫描件 / 手写体结构化抽取，输出 JSON',
  'z-image-turbo': '生图极速款：~4s 出图，适合草图 / 迭代试稿',
  'qwen-image-3.0': '生图标准款：质量与成本平衡，主体一致性好',
  'qwen-image-3.0-pro': '生图旗舰：细节 / 排版 / 文字渲染最强，用于终稿',
  'qwen-long': '超长上下文（1M）：长对话 / 长资料摘要，摘要任务单位成本最低',
  'qwen3.5-397b-a17b': 'MoE 大模型：难推理 / 数学 / 复杂约束求解的强备选',
  'qwq-plus': '深度推理专线（仅流式）：思维链更长，适合疑难问题兜底',
  'qwen-mt-plus': '翻译专项：多语种翻译质量与术语一致性优于通用模型',
}

export type AssignmentScope = 'global' | 'system' | 'agent'

/** 预定义的系统能力（UI 用）。 */
export const SYSTEM_CAPABILITIES = [
  { key: 'prompt_optimize', label: '提示词增强', description: '自动化 / 任务描述的 AI 优化' },
  { key: 'task_planning', label: '任务规划', description: 'Orchestrator 拆解子任务' },
  { key: 'context_summary', label: '上下文摘要', description: '长对话 / 长文档摘要' },
  { key: 'system_chat', label: '系统对话', description: '系统级对话 / 问答' },
] as const

/** 预定义的 Agent 能力（UI 用）。 */
export const AGENT_CAPABILITIES = [
  { key: 'agent:default', label: '默认 Agent', description: '未单独指定的 Agent' },
  { key: 'agent:code', label: '代码 Agent', description: '编程 / 调试 / 重构' },
  { key: 'agent:research', label: '研究 Agent', description: '资料检索 / 调研 / 分析' },
  { key: 'agent:design', label: '设计 Agent', description: 'UI / 视觉 / 原型' },
  { key: 'agent:writer', label: '写作 Agent', description: '文案 / 报告 / 摘要' },
] as const

/**
 * Agent 模态分类 —— 用于创建时自动匹配模型。
 *
 * 只保留常用开发会碰到的四类：写代码、写文本、识图、生图。音频与「多模态」两类早期有、
 * 但实际没有对应能力也没有对应模型，留着只会在策略面板里占位置，已归并到最接近的类型。
 */
export type AgentModality = 'text' | 'vision' | 'image' | 'code'

/**
 * 四类模态的展示元数据 —— UI 选择与 `MODALITY_CAPABILITIES` 的唯一真相源。
 *
 * 顺序即智能体模型分配面板里的排列顺序（`MODALITY_CAPABILITIES` 由它派生）。
 */
export const MODALITY_OPTIONS: ReadonlyArray<{
  value: AgentModality
  label: string
  description: string
}> = [
  { value: 'code', label: '代码', description: '编程 / 调试 / 重构' },
  { value: 'text', label: '文本', description: '文案 / 写作 / 对话 / 分析' },
  { value: 'vision', label: '视觉', description: '识图 / 截图理解 / 设计稿分析' },
  { value: 'image', label: '生图', description: '生成图片 / 海报 / 插画' },
]

export function modalityToCapabilityKey(modality: AgentModality): string {
  return `agent:${modality}`
}

export const MODALITY_CAPABILITIES: Array<{ key: string; label: string; description: string }> =
  MODALITY_OPTIONS.map((m) => ({
    key: modalityToCapabilityKey(m.value),
    label: `${m.label} Agent`,
    description: m.description,
  }))

/** 历史模态 → 现行四类的归并映射，保证旧 agent / 旧数值不悬空。 */
const MODALITY_ALIASES: Record<string, AgentModality> = {
  audio: 'text',
  multimodal: 'vision',
}

export function normalizeModality(value: string | null | undefined): AgentModality {
  const raw = value?.trim()
  if (!raw) return 'text'
  if (raw === 'text' || raw === 'vision' || raw === 'image' || raw === 'code') return raw
  return MODALITY_ALIASES[raw] ?? 'text'
}

/** 全局策略的 capabilityKey。 */
export const GLOBAL_KEYS = {
  defaultProvider: 'global:default_provider',
  fallbackProvider: 'global:fallback_provider',
  autoFailover: 'global:auto_failover',
} as const

/** provider-router 用的全局优先级 key（与 GLOBAL_KEYS 并存：前者是「默认供应商」，这个是「优先级链」）。 */
export const GLOBAL_PRIORITY_KEY = 'global:default'

// ─── 降级兜底（基线模型）───────────────────────────────────────
//
// 项目原有基线：deepseek 供应商 + deepseek-v4-flash。它是所有能力链的最后兜底，
// 保证「新接入的百炼模型不可用时，项目仍以原有能力水位稳定运行」。

export const FALLBACK_PROVIDER_ID = 'deepseek'
export const FALLBACK_MODEL_NAME = 'deepseek-v4-flash'

export interface PlannedAssignment {
  providerId: string
  modelName: string
  priority: number
}

/**
 * 模型分配默认方案（新装 / 首次启动时 seed，已配置过的能力不会被覆盖）。
 *
 * 每个能力都是一条「主模型 → 兜底」链，priority 越小越优先；
 * 链尾恒为 deepseek-v4-flash，即项目原有基线。
 */
export const DEFAULT_MODEL_ASSIGNMENT_PLAN: Record<string, PlannedAssignment[]> = {
  [GLOBAL_PRIORITY_KEY]: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3.8-flash', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  [GLOBAL_KEYS.defaultProvider]: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3.8-flash', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  [GLOBAL_KEYS.fallbackProvider]: [
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 0 },
  ],

  // ── Agent 模态 ──────────────────────────────────────────────
  'agent:code': [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3-coder-plus', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  'agent:text': [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3.8-flash', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  'agent:vision': [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3-vl-plus', priority: 0 },
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3-vl-flash', priority: 1 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 2 },
  ],
  'agent:image': [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'z-image-turbo', priority: 0 },
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen-image-3.0-pro', priority: 1 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 2 },
  ],

  // ── 系统能力 ────────────────────────────────────────────────
  prompt_optimize: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3.8-flash', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  task_planning: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen3.8-max', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  context_summary: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'qwen-long', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
  system_chat: [
    { providerId: BAILIAN_PROVIDER_ID, modelName: 'glm-5.3', priority: 0 },
    { providerId: FALLBACK_PROVIDER_ID, modelName: FALLBACK_MODEL_NAME, priority: 1 },
  ],
}

/** 分配方案里每个能力的 scope（落到 llm_model_assignments.scope）。 */
export function scopeForCapability(capabilityKey: string): AssignmentScope {
  if (capabilityKey.startsWith('global:')) return 'global'
  if (capabilityKey.startsWith('agent:')) return 'agent'
  return 'system'
}


export interface ProviderUsage {
  systemCapabilities: string[]
  agentCapabilities: string[]
  globalKeys: string[]
}

export interface ResolvedModel {
  providerId: string
  modelName: string | null
}

export interface AssignmentUpsertInput {
  id?: string
  scope: AssignmentScope
  capabilityKey: string
  providerId?: string | null
  modelName?: string | null
  priority?: number
  /** 用途级配置是否使用全局优先级（scope != 'global' 时有效） */
  useGlobal?: boolean
}
