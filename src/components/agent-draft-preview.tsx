'use client'

import { ShieldCheck, Sparkles, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  AGENT_BUILDER_PROVIDER_DEFAULTS,
  type AgentConfigDraft,
} from '@/shared/agent-builder-config'

/**
 * Agent 配置草稿的可读预览。
 *
 * 展示「这份配置会创建出一个什么样的 Agent」：身份、模型、工具权限、默认假设和
 * 完整 System Prompt。单 Agent 对话创建与团队成员详情配置共用。
 */
export function AgentDraftPreview({
  draft,
  className,
}: {
  draft: AgentConfigDraft
  className?: string
}) {
  const providerLabel = draft.modelProvider
    ? AGENT_BUILDER_PROVIDER_DEFAULTS[draft.modelProvider].label
    : 'SDK 默认'

  return (
    <div className={cn('space-y-3', className)}>
      <div className="rounded-md border bg-muted/20 px-3 py-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{draft.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{draft.description}</div>
            {draft.capabilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {draft.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-foreground/10"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] text-muted-foreground">模型</div>
          <div className="mt-1 text-xs font-medium">
            {providerLabel} / {draft.modelId ?? 'SDK 默认'}
          </div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] text-muted-foreground">视觉</div>
          <div className="mt-1 text-xs font-medium">
            {draft.supportsVision ? '默认开启' : '默认关闭'}
          </div>
        </div>
      </div>

      <section className="rounded-md border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Wrench className="size-3.5" />
          工具权限
        </div>
        {draft.toolPermissionSummaries.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {draft.toolPermissionSummaries.map((tool) => (
              <div key={tool.toolName} className="flex items-start gap-2 text-[11px]">
                <code className="mt-0.5 shrink-0 rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground">
                  {tool.toolName}
                </code>
                <div className="min-w-0">
                  <span className="font-medium">{tool.label}</span>
                  <span className="text-muted-foreground"> · {tool.desc}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-muted-foreground">
            SDK adapter 使用运行时内置工具集，不保存 Nexora Studio 自定义 toolNames。
          </div>
        )}
      </section>

      {draft.assumptions.length > 0 && (
        <section className="rounded-md border px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="size-3.5" />
            默认假设
          </div>
          <div className="mt-2 space-y-1.5">
            {draft.assumptions.map((assumption) => (
              <div key={assumption.label} className="text-[11px]">
                <span className="font-medium">{assumption.label}</span>
                <span className="text-muted-foreground"> · {assumption.detail}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-md border px-3 py-2">
        <div className="text-xs font-medium">System Prompt</div>
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[10px] leading-4 text-muted-foreground">
          {draft.systemPrompt}
        </pre>
      </section>
    </div>
  )
}
