'use client'

import { AlertTriangle, BookOpen, Bot, Boxes, RefreshCw, Search, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'

import { AgentToolSearchDialog } from '@/components/agent-tool-search-dialog'
import {
  buildAgentCapabilityBindings,
  buildCapabilityBindings,
  type AgentCapabilityBindingItem,
  type CapabilityBindingItem,
} from '@/components/capability-bindings'
import { McpServersSettings } from '@/components/mcp-servers-settings'
import { SkillsSettings } from '@/components/skills-settings'
import { InlineError, PageCard, PageHeader, PageShell } from '@/components/workbench-primitives'
import { fetchMcpServers, fetchSkills, type McpServerListItem, type SkillListItem } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore } from '@/stores/app-store'

export function CapabilityCenterWorkspace() {
  const agents = useAgentList()
  const setWorkbenchView = useAppStore((state) => state.setWorkbenchView)
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCapabilityTab, setActiveCapabilityTab] = useState<'skills' | 'mcp'>('skills')
  const [bindingView, setBindingView] = useState<'capability' | 'agent'>('capability')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSkills, nextMcpServers] = await Promise.all([fetchSkills(), fetchMcpServers()])
      setSkills(nextSkills)
      setMcpServers(nextMcpServers)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const skillBindings = useMemo(() => buildCapabilityBindings(agents, skills, 'skillIds'), [agents, skills])
  const mcpBindings = useMemo(() => buildCapabilityBindings(agents, mcpServers, 'mcpServerIds'), [agents, mcpServers])
  const agentBindings = useMemo(() => buildAgentCapabilityBindings(agents, skills, mcpServers), [agents, skills, mcpServers])
  const allBindings = [...skillBindings, ...mcpBindings]
  const brokenBindingCount = allBindings.filter((item) => item.missing).length
  const boundAgentIds = new Set(allBindings.flatMap((item) => item.agents.map((agent) => agent.id)))
  const totalBindings = allBindings.reduce((sum, item) => sum + item.agents.length, 0)
  const openAgentLibrary = () => setWorkbenchView('agents')

  return (
    <PageShell className="agenthub-hide-scrollbar p-2 lg:p-2.5" contentClassName="w-full max-w-none gap-2.5 lg:gap-3">
      <PageHeader
        icon={Boxes}
        title="能力中心"
        description="管理可复用 Skills、MCP Servers 与 Agent 绑定关系。"
        actions={<AgentToolSearchDialog agents={agents} />}
      />

      {error && <InlineError message={error} onRetry={() => void load()} />}

      <PageCard className="overflow-hidden p-0">
        <div className="grid gap-0 divide-y divide-[var(--agenthub-border)] md:grid-cols-[minmax(0,1fr)_280px] md:divide-x md:divide-y-0">
          <div className="p-2.5 sm:p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">能力概览</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">查看本地能力数量、绑定范围，并通过统一入口导入新能力。</p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="flex h-8 w-fit items-center gap-2 rounded-lg border border-[var(--agenthub-border)] px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-neutral-800"
              >
                <RefreshCw className={cn('size-3.5', loading && 'motion-safe:animate-spin')} />
                刷新索引
              </button>
            </div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              <CapabilityStat icon={BookOpen} label="Skills" value={`${skills.length}`} caption="规则、流程与提示词能力" />
              <CapabilityStat icon={Workflow} label="MCP Servers" value={`${mcpServers.length}`} caption="本机 stdio 工具服务" />
              <CapabilityStat icon={Bot} label="已绑定 Agent" value={`${boundAgentIds.size}`} caption={`${totalBindings} 条能力绑定`} />
            </div>
          </div>
          <div className="flex flex-col justify-between gap-2.5 bg-[var(--agenthub-surface-muted)] p-2.5 dark:bg-neutral-950/30 sm:p-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Search className="size-4 text-[var(--agenthub-accent)]" />
                联网搜索
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">从 GitHub 搜索可安装的 Skill / MCP，导入后再配置给目标 Agent。</p>
            </div>
            <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">主入口位于页面右上角。导入完成后请刷新索引查看最新绑定状态。</div>
          </div>
        </div>
      </PageCard>

      {loading && !error && skills.length === 0 && mcpServers.length === 0 && (
        <PageCard className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">正在加载能力索引...</PageCard>
      )}

      <section className="grid gap-2.5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <PageCard className="p-2.5 sm:p-3">
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">本地能力管理</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">维护已导入或本地创建的 Skills 与 MCP Servers。</p>
            </div>
            <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2.5 py-1 text-xs text-[var(--agenthub-accent)]">{skills.length + mcpServers.length} 项</span>
          </div>

          <SegmentedTabs
            value={activeCapabilityTab}
            onChange={setActiveCapabilityTab}
            items={[
              { id: 'skills', label: 'Skills', count: skills.length },
              { id: 'mcp', label: 'MCP Servers', count: mcpServers.length },
            ]}
          />

          <section className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-2.5 dark:bg-neutral-950/30">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {activeCapabilityTab === 'skills' ? <BookOpen className="size-4 text-slate-400" /> : <Workflow className="size-4 text-slate-400" />}
              {activeCapabilityTab === 'skills' ? 'Skills' : 'MCP Servers'}
            </div>
            {activeCapabilityTab === 'skills' ? <SkillsSettings /> : <McpServersSettings />}
          </section>
        </PageCard>

        <PageCard className="p-2.5 sm:p-3">
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent 绑定关系</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">按能力或 Agent 查看使用范围，快速定位重复或失效绑定。</p>
            </div>
            <Bot className="size-4 text-slate-400" />
          </div>

          {brokenBindingCount > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              有 {brokenBindingCount} 个绑定引用了不存在的能力，请检查对应 Agent 配置。
            </div>
          )}

          <SegmentedTabs
            value={bindingView}
            onChange={setBindingView}
            items={[
              { id: 'capability', label: '按能力' },
              { id: 'agent', label: '按 Agent' },
            ]}
          />

          {bindingView === 'capability' ? (
            <div className="space-y-3">
              <CapabilityBindingList title="Skill 绑定" empty="暂无 Skill 绑定" items={skillBindings} onOpenAgent={openAgentLibrary} />
              <CapabilityBindingList title="MCP 绑定" empty="暂无 MCP 绑定" items={mcpBindings} onOpenAgent={openAgentLibrary} />
            </div>
          ) : (
            <AgentCapabilityBindingList items={agentBindings} onOpenAgent={openAgentLibrary} />
          )}
        </PageCard>
      </section>
    </PageShell>
  )
}

function SegmentedTabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T
  items: Array<{ id: T; label: string; count?: number }>
  onChange: (value: T) => void
}) {
  return (
    <div className="mb-2.5 flex rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-1 dark:bg-neutral-950/30">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
            value === item.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-neutral-900 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {item.label}
          {item.count != null && <span className="text-[10px] text-slate-400">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

function CapabilityStat({ icon: Icon, label, value, caption }: { icon: ComponentType<{ className?: string }>; label: string; value: string; caption: string }) {
  return (
    <div className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-3 dark:bg-neutral-950/30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  )
}

function CapabilityBindingList({ title, empty, items, onOpenAgent }: { title: string; empty: string; items: CapabilityBindingItem[]; onOpenAgent: () => void }) {
  const bindingCount = items.reduce((sum, item) => sum + item.agents.length, 0)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <span className="text-[11px] text-slate-400">{bindingCount} 条</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-4 text-center text-xs text-slate-500 dark:bg-neutral-950/30 dark:text-slate-400">{empty}</div>
      ) : (
        <div className="agenthub-hide-scrollbar max-h-[320px] space-y-1.5 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className={cn('rounded-xl border bg-[var(--agenthub-surface-muted)] px-3 py-2.5 transition hover:border-[var(--agenthub-accent-border)] dark:bg-neutral-950/30', item.missing ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-[var(--agenthub-border)]')}>
              <div className="flex items-center justify-between gap-2">
                <div className={cn('flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-medium', item.missing ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100')} title={item.id}>
                  {item.missing && <AlertTriangle className="size-3.5 shrink-0" />}
                  <span className="truncate">{item.name}</span>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-[var(--agenthub-border)] dark:bg-neutral-900 dark:text-slate-400">{item.agents.length}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.agents.slice(0, 4).map((agent) => (
                  <button key={agent.id} type="button" onClick={onOpenAgent} className="max-w-[120px] truncate rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-[var(--agenthub-border)] transition hover:text-[var(--agenthub-accent)] hover:ring-[var(--agenthub-accent-border)] dark:bg-neutral-900 dark:text-slate-300" title={`打开 Agent 库：${agent.name}`}>
                    {agent.name}
                  </button>
                ))}
                {item.agents.length > 4 && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-[var(--agenthub-border)] dark:bg-neutral-900">+{item.agents.length - 4}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCapabilityBindingList({ items, onOpenAgent }: { items: AgentCapabilityBindingItem[]; onOpenAgent: () => void }) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-4 text-center text-xs text-slate-500 dark:bg-neutral-950/30 dark:text-slate-400">暂无 Agent 绑定能力</div>
  }
  return (
    <div className="agenthub-hide-scrollbar max-h-[660px] space-y-1.5 overflow-y-auto">
      {items.map((item) => (
        <div key={item.agent.id} className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-2.5 dark:bg-neutral-950/30">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onOpenAgent} className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-900 transition hover:text-[var(--agenthub-accent)] dark:text-slate-100" title={`打开 Agent 库：${item.agent.name}`}>
              {item.agent.name}
            </button>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-[var(--agenthub-border)] dark:bg-neutral-900 dark:text-slate-400">{item.skills.length + item.mcpServers.length} 项</span>
          </div>
          <AgentCapabilityChips label="Skills" items={item.skills} />
          <AgentCapabilityChips label="MCP" items={item.mcpServers} />
        </div>
      ))}
    </div>
  )
}

function AgentCapabilityChips({ label, items }: { label: string; items: Array<{ id: string; name: string; missing: boolean }> }) {
  if (items.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      {items.slice(0, 5).map((item) => (
        <span key={item.id} className={cn('max-w-[150px] truncate rounded-full px-2 py-0.5 text-[10px] ring-1', item.missing ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30' : 'bg-white text-slate-600 ring-[var(--agenthub-border)] dark:bg-neutral-900 dark:text-slate-300')} title={item.id}>
          {item.name}
        </span>
      ))}
      {items.length > 5 && <span className="text-[10px] text-slate-400">+{items.length - 5}</span>}
    </div>
  )
}
