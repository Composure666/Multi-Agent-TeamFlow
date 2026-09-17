'use client'

import { Cpu, User, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AgentRow } from '@/db/schema'
import {
  fetchMcpServers,
  fetchSkills,
  type CreateAgentBody,
  type McpServerListItem,
  type SkillListItem,
} from '@/lib/api'
import {
  MODALITY_OPTIONS,
  normalizeModality,
  type AgentModality,
} from '@/lib/llm-shared'
import { cn } from '@/lib/utils'
import {
  AGENT_BUILDER_PROVIDER_DEFAULTS as PROVIDER_DEFAULTS,
  AGENT_TOOL_META as TOOL_META,
  AGENT_TOOL_PRESETS as TOOL_PRESETS,
  AVAILABLE_AGENT_TOOLS,
  CLAUDE_CODE_DEFAULT_MODEL,
  CODEX_DEFAULT_MODEL,
  DEFAULT_CUSTOM_AGENT_TOOLS,
  buildToolPermissionSummaries,
  normalizeAgentToolNames,
  type AgentBuilderAdapter as AdapterKind,
  type AgentBuilderProvider as Provider,
  type AgentConfigDraft,
  type AgentToolName as ToolName,
} from '@/shared/agent-builder-config'
import { validateCodexBaseUrl } from '@/shared/codex-compat'
import {
  validateOpenAICompatibleApiKey,
  validateOpenAICompatibleBaseUrl,
} from '@/shared/openai-compatible'

/**
 * Agent 配置的「表单态」。
 *
 * 与 `AgentConfigDraft` 的区别：能力标签保留为原始文本（避免边输入边 split 破坏
 * 输入体验），API Key / Base URL 常驻表单（draft 里是可选的覆盖值）。
 *
 * 单 Agent 创建、编辑与团队成员配置都共用这套结构，见 `agent-config-form.tsx`。
 */
export interface AgentFormValue {
  name: string
  description: string
  capabilitiesText: string
  systemPrompt: string
  adapterName: AdapterKind
  modelProvider: Provider
  modelId: string
  toolNames: string[]
  mcpServerIds: string[]
  skillIds: string[]
  supportsVision: boolean
  /** 模态分类（代码 / 文本 / 视觉 / 生图），参与创建时的模型自动匹配 */
  modality: AgentModality
  apiKey: string
  apiBaseUrl: string
}

export type AgentTab = 'basic' | 'model' | 'toolsPrompt'

export interface AgentFormIssue {
  tab: AgentTab
  message: string
}

export const AGENT_FORM_TABS: ReadonlyArray<{ value: AgentTab; label: string }> = [
  { value: 'basic', label: '基本信息' },
  { value: 'model', label: '模型与适配器' },
  { value: 'toolsPrompt', label: '工具与提示词' },
]

export const DEFAULT_CUSTOM_SYSTEM_PROMPT = `你是一个 Nexora Studio custom agent。你的任务是理解用户目标，使用已启用的工具完成工作，并把结果清晰交付给用户。

工作原则：
1. 先判断需要什么上下文；只有在用户提到附件、已有产物或工作区文件时，才调用对应读取工具。
2. 多步骤任务先给自己形成简短计划，但不要把固定流程强加给简单问题。
3. 工具调用要少而准确；每次调用都应服务于当前目标。
4. 产出代码、网页、文档或设计稿时，优先用 write_artifact 创建结构化产物；网页产物完成后再调用 deploy_artifact。
5. 探索项目目录时优先用 fs_list，再用 fs_read 读取具体文件；使用 fs_write 或 bash 前确认确有必要，并只在当前 workspace 范围内操作。
6. 最终回复保持简洁，说明完成了什么、产物在哪里、还剩什么需要用户决策。`

/** adapter + provider 组合下的默认 modelId。 */
export function defaultModelForAdapter(kind: AdapterKind, provider: Provider): string {
  if (kind === 'claude-code') return CLAUDE_CODE_DEFAULT_MODEL
  if (kind === 'codex') return CODEX_DEFAULT_MODEL
  return PROVIDER_DEFAULTS[provider].defaultModel
}

/** 从 AgentRow 的 adapterName 推导出表单支持的三种适配器。 */
export function adapterKindFromRow(agent: AgentRow): AdapterKind {
  return agent.adapterName === 'claude-code'
    ? 'claude-code'
    : agent.adapterName === 'codex'
      ? 'codex'
      : 'custom'
}

export function createEmptyAgentFormValue(): AgentFormValue {
  return {
    name: '',
    description: '',
    capabilitiesText: '',
    systemPrompt: DEFAULT_CUSTOM_SYSTEM_PROMPT,
    // 新建 Agent 默认走 claude-code adapter：它由 Claude Agent SDK 驱动，
    // 经供应商中心的 anthropic 行指向 DeepSeek 的 Anthropic 兼容端点，
    // 因而自带 SDK 内置工具与原生 WebSearch（联网搜索）。
    adapterName: 'claude-code',
    modelProvider: 'deepseek',
    modelId: CLAUDE_CODE_DEFAULT_MODEL,
    toolNames: [...DEFAULT_CUSTOM_AGENT_TOOLS],
    mcpServerIds: [],
    skillIds: [],
    supportsVision: true,
    modality: 'text',
    apiKey: '',
    apiBaseUrl: '',
  }
}

/** 能力标签输入 → 数组。 */
export function parseCapabilitiesText(text: string): string[] {
  return text
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function agentFormValueToDraft(
  value: AgentFormValue,
  base?: Partial<AgentConfigDraft>,
): AgentConfigDraft {
  const toolNames = normalizeAgentToolNames(value.toolNames)
  return {
    name: value.name.trim(),
    avatar: base?.avatar ?? '🤖',
    description: value.description.trim(),
    capabilities: parseCapabilitiesText(value.capabilitiesText),
    systemPrompt: value.systemPrompt.trim(),
    adapterName: value.adapterName,
    modelProvider: value.modelProvider,
    modelId: value.modelId.trim() || undefined,
    modality: normalizeModality(value.modality ?? base?.modality),
    toolNames,
    supportsVision: value.supportsVision,
    rationale: base?.rationale ?? [],
    assumptions: base?.assumptions ?? [],
    toolPermissionSummaries: buildToolPermissionSummaries(toolNames),
  }
}

/** AgentConfigDraft → 创建 Agent 的请求体（单 Agent 创建与团队成员创建共用）。 */
export function agentDraftToCreateBody(draft: AgentConfigDraft): CreateAgentBody {
  const isSdkAgent = draft.adapterName === 'claude-code' || draft.adapterName === 'codex'
  return {
    name: draft.name.trim(),
    avatar: draft.avatar || '🤖',
    description: draft.description.trim(),
    capabilities: draft.capabilities,
    systemPrompt: draft.systemPrompt.trim(),
    adapterName: draft.adapterName,
    modelProvider: isSdkAgent ? undefined : draft.modelProvider,
    modelId: draft.modelId?.trim() || undefined,
    toolNames: isSdkAgent ? [] : draft.toolNames,
    mcpServerIds: [],
    skillIds: [],
    supportsVision: draft.supportsVision,
    modality: normalizeModality(draft.modality),
  }
}

export function agentFormValueFromDraft(
  draft: AgentConfigDraft,
  base?: Partial<AgentFormValue>,
): AgentFormValue {
  const kind = draft.adapterName
  const provider = draft.modelProvider ?? 'deepseek'
  return {
    name: draft.name,
    description: draft.description,
    capabilitiesText: draft.capabilities.join(', '),
    systemPrompt: draft.systemPrompt,
    adapterName: kind,
    modelProvider: provider,
    modelId: draft.modelId ?? defaultModelForAdapter(kind, provider),
    toolNames: [...draft.toolNames],
    mcpServerIds: base?.mcpServerIds ? [...base.mcpServerIds] : [],
    skillIds: base?.skillIds ? [...base.skillIds] : [],
    supportsVision: draft.supportsVision,
    modality: normalizeModality(draft.modality),
    apiKey: base?.apiKey ?? '',
    apiBaseUrl: base?.apiBaseUrl ?? '',
  }
}

export function agentFormValueFromRow(agent: AgentRow): AgentFormValue {
  const kind = adapterKindFromRow(agent)
  const provider = (agent.modelProvider ?? 'deepseek') as Provider
  return {
    name: agent.name,
    description: agent.description,
    capabilitiesText: agent.capabilities.join(', '),
    systemPrompt: agent.systemPrompt,
    adapterName: kind,
    modelProvider: provider,
    modelId: agent.modelId ?? defaultModelForAdapter(kind, provider),
    toolNames: [...agent.toolNames],
    mcpServerIds: [...agent.mcpServerIds],
    skillIds: [...agent.skillIds],
    supportsVision: agent.supportsVision,
    modality: normalizeModality(agent.modality),
    apiKey: agent.apiKey ?? '',
    apiBaseUrl: agent.apiBaseUrl ?? '',
  }
}

/** 表单校验。返回首个问题（含应聚焦的 tab），无问题返回 null。 */
export function validateAgentFormValue(value: AgentFormValue): AgentFormIssue | null {
  if (!value.name.trim()) return { tab: 'basic', message: '名称不能为空' }
  if (!value.description.trim()) return { tab: 'basic', message: '描述不能为空' }
  if (!value.systemPrompt.trim()) return { tab: 'toolsPrompt', message: 'System Prompt 不能为空' }
  if (value.adapterName === 'custom' && !value.modelId.trim()) {
    return { tab: 'model', message: 'Custom adapter 必须填写 Model ID' }
  }

  const apiBaseUrl = value.apiBaseUrl.trim()
  const apiKey = value.apiKey.trim()

  if (value.adapterName === 'codex') {
    const baseUrlError = validateCodexBaseUrl(apiBaseUrl || null)
    if (baseUrlError) return { tab: 'model', message: baseUrlError }
  }
  if (value.adapterName === 'custom') {
    const baseUrlError = validateOpenAICompatibleBaseUrl(value.modelProvider, apiBaseUrl || null)
    if (baseUrlError) return { tab: 'model', message: baseUrlError }
    const apiKeyError = validateOpenAICompatibleApiKey(value.modelProvider, apiKey || null)
    if (apiKeyError) return { tab: 'model', message: apiKeyError }
  }

  return null
}

function isMcpServerCompatible(server: McpServerListItem, adapterKind: AdapterKind): boolean {
  if (!server.enabled) return false
  if (adapterKind === 'custom') return false
  if (adapterKind === 'codex') return server.trust === 'always'
  return adapterKind === 'claude-code'
}

/**
 * Agent 详细配置表单（基本信息 / 模型与适配器 / 工具与提示词）。
 *
 * 受控组件：单 Agent 创建、编辑、以及团队成员的详情配置都复用它，
 * 这样「同一个 Agent 在哪儿配置都是同一套界面与校验」。
 */
export function AgentConfigForm({
  value,
  onChange,
  activeTab,
  onActiveTabChange,
  error,
  className,
}: {
  value: AgentFormValue
  onChange: (patch: Partial<AgentFormValue>) => void
  activeTab: AgentTab
  onActiveTabChange: (tab: AgentTab) => void
  error?: string | null
  className?: string
}) {
  const [showApiKey, setShowApiKey] = useState(false)
  const [mcpServers, setMcpServers] = useState<McpServerListItem[]>([])
  const [skills, setSkills] = useState<SkillListItem[]>([])

  // MCP / Skills 是可选附加项，配置后再单独挂载；这里只负责列表可选项。
  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchMcpServers(), fetchSkills()])
      .then(([servers, skillList]) => {
        if (cancelled) return
        setMcpServers(servers)
        setSkills(skillList)
      })
      .catch((err) => {
        console.warn('[AgentConfigForm] load mcp/skills failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { adapterName: adapterKind } = value

  const handleAdapterKindChange = (kind: AdapterKind) => {
    const patch: Partial<AgentFormValue> = {
      adapterName: kind,
      modelId: defaultModelForAdapter(kind, value.modelProvider),
    }
    if (kind === 'custom') {
      if (value.toolNames.length === 0) patch.toolNames = [...DEFAULT_CUSTOM_AGENT_TOOLS]
      if (!value.systemPrompt.trim()) patch.systemPrompt = DEFAULT_CUSTOM_SYSTEM_PROMPT
    }
    onChange(patch)
  }

  const handleProviderChange = (provider: Provider) => {
    // 切换 provider 时把 modelId 自动重置到该 provider 的默认（避免跨家串）
    onChange({ modelProvider: provider, modelId: defaultModelForAdapter(adapterKind, provider) })
  }

  const applyToolPreset = (tools: readonly ToolName[]) => {
    onChange({ toolNames: [...tools] })
  }

  const isPresetActive = (tools: readonly ToolName[]) =>
    value.toolNames.length === tools.length && tools.every((toolName) => value.toolNames.includes(toolName))

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => onActiveTabChange(v as AgentTab)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList className="self-start">
          <TabsTrigger value="basic">
            <User className="size-3.5" />
            基本信息
          </TabsTrigger>
          <TabsTrigger value="model">
            <Cpu className="size-3.5" />
            模型与适配器
          </TabsTrigger>
          <TabsTrigger value="toolsPrompt">
            <Wrench className="size-3.5" />
            工具与提示词
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="basic" className="mt-0 space-y-3 py-1">
            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label required>名称</Label>
              <Input
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="例：TestBot"
              />
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label required>描述</Label>
              <Input
                value={value.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="一句话讲清楚它能做什么"
              />
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>能力标签</Label>
              <div>
                <Input
                  value={value.capabilitiesText}
                  onChange={(e) => onChange({ capabilitiesText: e.target.value })}
                  placeholder="testing, react, vitest"
                />
                <div className="mt-1 text-[10px] text-muted-foreground">用逗号或空格分隔</div>
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>模态</Label>
              <div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {MODALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange({ modality: opt.value as AgentModality })}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-left text-xs transition hover:border-foreground/30',
                        value.modality === opt.value && 'border-primary bg-primary/5',
                      )}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  决定模型自动匹配的策略档位（{`agent:${value.modality}`}）
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="model" className="mt-0 space-y-3 py-1">
            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>适配器</Label>
              <div className="flex flex-col gap-1.5">
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                    adapterKind === 'custom' && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="adapterKind"
                    checked={adapterKind === 'custom'}
                    onChange={() => handleAdapterKindChange('custom')}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Custom Agent SDK</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      用 DeepSeek / OpenAI / 火山方舟 / 自定义 OpenAI-compatible API。可自定义工具集和模型。
                    </div>
                  </div>
                </label>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                    adapterKind === 'claude-code' && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="adapterKind"
                    checked={adapterKind === 'claude-code'}
                    onChange={() => handleAdapterKindChange('claude-code')}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Claude Code SDK</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      用 @anthropic-ai/claude-agent-sdk，自带 Bash / Read / Write / Edit / Grep / Glob / WebFetch / Task 子 agent 等一整套工具。
                    </div>
                  </div>
                </label>
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                    adapterKind === 'codex' && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="adapterKind"
                    checked={adapterKind === 'codex'}
                    onChange={() => handleAdapterKindChange('codex')}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Codex SDK</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      用 @openai/codex-sdk，支持本地仓库读写、命令执行、线程续接和结构化事件流；需要 Codex/Responses 兼容后端。
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {adapterKind === 'custom' ? (
              <div className="grid grid-cols-[80px_1fr] items-start gap-3">
                <Label>底层模型</Label>
                <div className="flex gap-2">
                  <select
                    value={value.modelProvider}
                    onChange={(e) => handleProviderChange(e.target.value as Provider)}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    {(Object.keys(PROVIDER_DEFAULTS) as Provider[]).map((p) => (
                      <option key={p} value={p}>
                        {PROVIDER_DEFAULTS[p].label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={value.modelId}
                    onChange={(e) => onChange({ modelId: e.target.value })}
                    placeholder="model id"
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[80px_1fr] items-start gap-3">
                <Label>Model ID</Label>
                <div>
                  <Input
                    value={value.modelId}
                    onChange={(e) => onChange({ modelId: e.target.value })}
                    placeholder={
                      adapterKind === 'claude-code' ? CLAUDE_CODE_DEFAULT_MODEL : CODEX_DEFAULT_MODEL
                    }
                    className="font-mono text-xs"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {adapterKind === 'claude-code' ? (
                      <>
                        Claude 模型 id，例 <code className="font-mono">claude-opus-4-7</code> /{' '}
                        <code className="font-mono">claude-sonnet-4-6</code>。留空走 SDK 默认。
                      </>
                    ) : (
                      <>
                        Codex 模型 id，例 <code className="font-mono">gpt-5-codex</code>。留空走 SDK 默认。
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(adapterKind === 'claude-code' ||
              adapterKind === 'codex' ||
              (adapterKind === 'custom' && value.modelProvider === 'openai-compatible')) && (
              <div className="grid grid-cols-[80px_1fr] items-start gap-3">
                <Label required={adapterKind === 'custom' && value.modelProvider === 'openai-compatible'}>
                  Base URL
                </Label>
                <div>
                  <Input
                    value={value.apiBaseUrl}
                    onChange={(e) => onChange({ apiBaseUrl: e.target.value })}
                    placeholder={
                      adapterKind === 'claude-code'
                        ? 'https://api.anthropic.com（默认）'
                        : adapterKind === 'codex'
                          ? 'https://api.openai.com/v1（默认，需支持 /responses）'
                          : 'https://dashscope.aliyuncs.com/compatible-mode/v1'
                    }
                    className="font-mono text-xs"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {adapterKind === 'claude-code' ? (
                      <>
                        指向第三方 Claude API 兼容网关（如 <code className="font-mono">https://anyrouter.top</code>）；留空走 Anthropic 官方 endpoint。配此项时下方 API Key 自动作为 <code className="font-mono">ANTHROPIC_AUTH_TOKEN</code> 传给 SDK。
                      </>
                    ) : adapterKind === 'codex' ? (
                      <>
                        必须指向 Codex/Responses 兼容 endpoint；DeepSeek / 火山方舟等 Chat Completions 兼容接口请用 Custom adapter。留空走 Codex SDK 默认 endpoint。
                      </>
                    ) : (
                      <>
                        必须指向 OpenAI Chat Completions 兼容 endpoint，例如通义千问 compatible-mode、智谱 / MiniMax / OpenRouter / SiliconFlow 的 OpenAI 兼容地址。
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>
                {adapterKind === 'claude-code' && value.apiBaseUrl.trim() ? 'Auth Token' : 'API Key'}
              </Label>
              <div>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={value.apiKey}
                    onChange={(e) => onChange({ apiKey: e.target.value })}
                    placeholder={
                      adapterKind === 'claude-code' && value.apiBaseUrl.trim()
                        ? '第三方网关的 token'
                        : adapterKind === 'codex' && value.apiBaseUrl.trim()
                          ? 'Codex/Responses endpoint token'
                          : adapterKind === 'custom' && value.modelProvider === 'openai-compatible'
                            ? 'OpenAI-compatible endpoint token'
                            : '留空则使用环境变量'
                    }
                    className="flex-1 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowApiKey((v) => !v)}
                  >
                    {showApiKey ? '隐藏' : '显示'}
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {adapterKind === 'claude-code' && value.apiBaseUrl.trim() ? (
                    <>填写后作为 <code className="font-mono">ANTHROPIC_AUTH_TOKEN</code> 传给 SDK，路由到自定义 Base URL；留空则透传空 token（第三方网关可能拒绝）</>
                  ) : adapterKind === 'codex' && value.apiBaseUrl.trim() ? (
                    <>填写后作为 <code className="font-mono">CODEX_API_KEY</code> 传给 SDK，路由到自定义 Codex/Responses Base URL；留空则走 Nexora Studio 设置或环境变量</>
                  ) : adapterKind === 'custom' && value.modelProvider === 'openai-compatible' ? (
                    <>OpenAI-compatible provider 需要为该 agent 单独填写 API Key；不会使用全局 OpenAI / DeepSeek / 火山方舟 key。</>
                  ) : (
                    <>
                      填写后该 agent 优先用此 key；留空则 fallback 到{' '}
                      <code className="font-mono">
                        {adapterKind === 'claude-code'
                          ? 'ANTHROPIC_API_KEY 环境变量 / 本机 ~/.claude OAuth 登录态'
                          : adapterKind === 'codex'
                            ? 'OPENAI_API_KEY / CODEX_API_KEY 环境变量'
                            : value.modelProvider === 'deepseek'
                              ? 'DEEPSEEK_API_KEY'
                              : value.modelProvider === 'volcano-ark'
                                ? 'ARK_API_KEY'
                                : value.modelProvider === 'openai'
                                  ? 'OPENAI_API_KEY'
                                  : value.modelProvider === 'anthropic'
                                    ? 'ANTHROPIC_API_KEY'
                                    : '该 agent 的 API Key'}
                      </code>
                      {adapterKind === 'claude-code' || adapterKind === 'codex' ? '' : ' 环境变量'}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>视觉</Label>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                  value.supportsVision && 'border-primary bg-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={value.supportsVision}
                  onChange={(e) => onChange({ supportsVision: e.target.checked })}
                  className="mt-0.5 accent-primary"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium">该模型支持视觉（多模态）</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {adapterKind === 'codex'
                      ? '勾选后，发图片时会以本地图片输入传给 Codex SDK。模型不支持会被拒绝，请确认 modelId 支持视觉。'
                      : '勾选后，发图片时会以 base64 注入 messages.content。模型不支持会被 API 拒绝 (400)，请确认你填的 modelId 真的支持视觉。'}
                  </div>
                </div>
              </label>
            </div>
          </TabsContent>

          <TabsContent value="toolsPrompt" className="mt-0 space-y-3 py-1">
            {adapterKind === 'custom' ? (
              <div className="grid grid-cols-[80px_1fr] items-start gap-3">
                <Label>工具集</Label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {TOOL_PRESETS.map((preset) => {
                      const active = isPresetActive(preset.tools)
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyToolPreset(preset.tools)}
                          className={cn(
                            'rounded-md border px-2.5 py-2 text-left transition hover:border-foreground/30',
                            active && 'border-primary bg-primary/5',
                          )}
                        >
                          <div className="text-xs font-medium">{preset.label}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {preset.desc}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {AVAILABLE_AGENT_TOOLS.map((t) => {
                    const meta = TOOL_META[t]
                    const checked = value.toolNames.includes(t)
                    return (
                      <label
                        key={t}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                          checked && 'border-primary bg-primary/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onChange({
                              toolNames: checked
                                ? value.toolNames.filter((name) => name !== t)
                                : [...value.toolNames, t],
                            })
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{meta.label}</span>
                            <code className="font-mono text-[10px] text-muted-foreground">{t}</code>
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{meta.desc}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[80px_1fr] items-start gap-3">
                <Label>工具集</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  {adapterKind === 'claude-code' ? (
                    <>
                      Claude Code agent 使用 SDK 内置工具集：Bash / Read / Write / Edit / Grep / Glob /
                      WebFetch / WebSearch / Task / TodoWrite 等。审批 / 沙箱 / 黑名单仍由 Nexora Studio 接管。
                    </>
                  ) : (
                    <>
                      Codex agent 使用 Codex SDK 内置的本地命令、文件修改、MCP 调用和计划事件。
                      Review 模式下以只读沙箱运行；Auto 模式下允许 workspace-write。运行时使用 Nexora Studio 隔离配置，不读取本机 ~/.codex。
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>Skills</Label>
              <div className="grid gap-1.5">
                {skills.length === 0 ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    暂无 Skills；可在设置里刷新 Skills 索引。
                  </div>
                ) : (
                  skills.map((skill) => {
                    const checked = value.skillIds.includes(skill.id)
                    return (
                      <label
                        key={skill.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                          checked && 'border-primary bg-primary/5',
                          !skill.enabled && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!skill.enabled}
                          onChange={() =>
                            onChange({
                              skillIds: checked
                                ? value.skillIds.filter((id) => id !== skill.id)
                                : [...value.skillIds, skill.id],
                            })
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium">{skill.name}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{skill.description}</div>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label>MCP</Label>
              <div className="grid gap-1.5">
                {(adapterKind === 'custom' || mcpServers.length === 0) && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    {adapterKind === 'custom'
                      ? 'Custom adapter 当前暂不支持外部 MCP。'
                      : '暂无 MCP server；可在设置里添加。'}
                  </div>
                )}
                {adapterKind !== 'custom' &&
                  mcpServers.map((server) => {
                    const compatible = isMcpServerCompatible(server, adapterKind)
                    const checked = value.mcpServerIds.includes(server.id) && compatible
                    return (
                      <label
                        key={server.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition hover:border-foreground/30',
                          checked && 'border-primary bg-primary/5',
                          !compatible && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!compatible}
                          onChange={() => {
                            if (!compatible) return
                            onChange({
                              mcpServerIds: checked
                                ? value.mcpServerIds.filter((id) => id !== server.id)
                                : [...value.mcpServerIds, server.id],
                            })
                          }}
                          className="mt-0.5 accent-primary"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <span>{server.name}</span>
                            <code className="text-[10px] text-muted-foreground">{server.trust}</code>
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {server.command} {server.args.join(' ')}
                            {adapterKind === 'codex' && server.trust === 'ask' ? ' · Codex 仅支持 always' : ''}
                          </div>
                        </div>
                      </label>
                    )
                  })}
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-start gap-3">
              <Label required>System Prompt</Label>
              <Textarea
                value={value.systemPrompt}
                onChange={(e) => onChange({ systemPrompt: e.target.value })}
                placeholder="你是…&#10;你的核心产出是…&#10;遵守以下原则…"
                className="min-h-[160px] font-mono text-xs"
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {error && (
        <div className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="pt-2 text-xs text-muted-foreground">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </div>
  )
}
