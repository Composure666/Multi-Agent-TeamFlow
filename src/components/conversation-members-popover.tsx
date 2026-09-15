'use client'

import { useState, type ReactNode } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { CreateAgentDialog } from '@/components/create-agent-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AgentRow } from '@/db/schema'
import { cn } from '@/lib/utils'

/** provider 英文枚举 → 头像下方展示的短标签。 */
const PROVIDER_SHORT_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  'volcano-ark': '火山方舟',
  'openai-compatible': '兼容接口',
}

/**
 * 会话成员浮层 —— 点会话标题（如「竞逐智囊团」）展开本会话的全部 Agent 头像。
 *
 * 只列**本会话的成员**，不是全局 Agent 库：群聊里某个成员没吃到 provider key
 * 跑不起来时，用户在这里一眼能看到「谁没配模型」，点该头像直接打开同一个
 * 配置表单（CreateAgentDialog 编辑模式）改模型 / 适配器 / API Key。
 * 不再额外放「设置」按钮 —— 头像本身就是入口。
 */
export function ConversationMembersPopover({
  title,
  agents,
  total,
  children,
  className,
}: {
  /** 会话标题，用于浮层里说明当前是哪个会话 */
  title: string
  /** 本会话已加载出来的成员；members 数量以 total 为准 */
  agents: AgentRow[]
  /** 会话自身的 agentIds 数量（store 里的 Agent 可能还没加载完） */
  total: number
  /** 触发器内容（标题文字） */
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AgentRow | null>(null)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'group flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            className,
          )}
          title={`${title} · 查看本会话成员`}
        >
          {children}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 gap-0 p-0">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <span className="truncate text-xs font-medium text-slate-500">
              本会话成员 · {total} 位
            </span>
            <span className="shrink-0 text-[10px] text-slate-400">点头像配置模型</span>
          </div>

          {agents.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">成员信息加载中…</div>
          ) : (
            <div className="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto p-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setEditing(agent)
                  }}
                  title={`${agent.name} · 点击配置模型`}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 transition hover:bg-slate-50"
                >
                  <AgentAvatar agent={agent} size="md" />
                  <span className="w-full truncate text-center text-[11px] font-medium text-slate-700">
                    {agent.name}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-slate-400">
                    {modelLabel(agent)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <CreateAgentDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        agent={editing ?? undefined}
      />
    </>
  )
}

function modelLabel(agent: AgentRow): string {
  const provider = PROVIDER_SHORT_LABELS[agent.modelProvider ?? ''] ?? agent.modelProvider
  const model = agent.modelId?.trim()
  if (provider && model) return `${provider} · ${model}`
  return model || provider || '未配置模型'
}
