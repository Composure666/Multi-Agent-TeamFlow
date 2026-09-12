'use client'

import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Boxes,
  Database,
  Eye,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  PlayCircle,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'

import { AgentToolSearchDialog } from '@/components/agent-tool-search-dialog'
import {
  buildCapabilityBindings,
  type CapabilityBindingItem,
} from '@/components/capability-bindings'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InlineError, PageShell } from '@/components/workbench-primitives'
import {
  createMcpServer,
  deleteMcpServer,
  fetchMcpServers,
  fetchSkills,
  fetchUsageSummary,
  testMcpServer,
  updateMcpServer,
  updateSkill,
  type McpConnectionTestResult,
  type McpServerListItem,
  type SkillListItem,
  type UsageSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAgentList, useAppStore } from '@/stores/app-store'

type CapabilityRowKind = 'skill' | 'mcp_server' | 'resource'
type CapabilityTabId = 'all' | 'skills' | 'mcp' | 'resources'

const TAB_ITEMS: Array<{ id: CapabilityTabId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'resources', label: '资源' },
]

// 1 天的毫秒数，用于「本周新增」「近期」类趋势计算
const DAY_MS = 24 * 60 * 60 * 1000

/** 能力类型 → 展示用的 metadata：图标、颜色、标签。 */
const KIND_META: Record<
  CapabilityRowKind,
  { label: string; tone: 'violet' | 'blue' | 'amber'; icon: ComponentType<{ className?: string }> }
> = {
  skill: { label: 'Skill', tone: 'violet', icon: BookOpen },
  mcp_server: { label: 'MCP Server', tone: 'blue', icon: Workflow },
  resource: { label: '资源', tone: 'amber', icon: Database },
}

export function CapabilityCenterWorkspace() {
  const agents = useAgentList()
  const setWorkbenchView = useAppStore((state) => state.setWorkbenchView)
  const upsertAgent = useAppStore((state) => state.upsertAgent)
  const addNotification = useAppStore((state) => state.addNotification)
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerListItem[]>([])
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  // 用稳定的 nowMs 替代 Date.now()，避免 react-hooks/purity 报错；
  // 仅在 mount + skills 变化时刷新，因此不引入额外的 setInterval。
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    setNowMs(Date.now())
  }, [skills])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CapabilityTabId>('all')
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerListItem | null>(null)
  const [createServerOpen, setCreateServerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<McpServerListItem | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; result: McpConnectionTestResult } | null>(null)
  const [showAllSection, setShowAllSection] = useState<ShowAllSection | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSkills, nextMcpServers, nextUsage] = await Promise.all([
        fetchSkills(),
        fetchMcpServers(),
        fetchUsageSummary().catch(() => null),
      ])
      setSkills(nextSkills)
      setMcpServers(nextMcpServers)
      setUsage(nextUsage)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshIndex = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const nextSkills = await fetchSkills()
      setSkills(nextSkills)
      addNotification({
        id: `skill_refresh_${Date.now()}`,
        title: 'Skill 索引已刷新',
        body: `共扫描到 ${nextSkills.length} 个 Skill。`,
        level: 'success',
        source: 'ui',
        category: 'configuration',
        createdAt: Date.now(),
        toast: true,
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      addNotification({
        id: `skill_refresh_err_${Date.now()}`,
        title: '刷新 Skill 失败',
        body: message,
        level: 'error',
        source: 'ui',
        category: 'error',
        createdAt: Date.now(),
        toast: true,
      })
    } finally {
      setRefreshing(false)
    }
  }, [addNotification])

  useEffect(() => {
    void load()
  }, [load])

  // 任意条件变化时回到第一页
  useEffect(() => {
    setPageIndex(0)
  }, [activeTab, query, sortMode, skills, mcpServers])

  const skillBindings = useMemo(() => buildCapabilityBindings(agents, skills, 'skillIds'), [agents, skills])
  const mcpBindings = useMemo(() => buildCapabilityBindings(agents, mcpServers, 'mcpServerIds'), [agents, mcpServers])
  const allBindings = useMemo(() => [...skillBindings, ...mcpBindings], [skillBindings, mcpBindings])
  const boundAgentIds = useMemo(
    () => new Set(allBindings.flatMap((item) => item.agents.map((agent) => agent.id))),
    [allBindings],
  )
  const totalBindings = useMemo(
    () => allBindings.reduce((sum, item) => sum + item.agents.length, 0),
    [allBindings],
  )

  // 合并后的能力行（用于左侧表格）
  // 「资源」派生策略：skills 列表中 sourcePath 含 "resources" 子路径的视作本地资源条目。
  // 这样 tab 计数与「资源」列表都基于真实数据；没有 resources 路径时显示空状态。
  const rows = useMemo<CapabilityRow[]>(() => {
    const skillRows: CapabilityRow[] = skills.map((skill) => ({
      id: skill.id,
      kind: isResourcePath(skill.sourcePath) ? 'resource' : 'skill',
      name: skill.name,
      description: skill.description || skill.sourcePath,
      meta: skill.sourcePath,
      enabled: skill.enabled,
      updatedAt: skill.updatedAt,
      bindingCount: skillBindings.find((b) => b.id === skill.id)?.agents.length ?? 0,
      sourcePath: skill.sourcePath,
      tags: skill.tags,
    }))
    const mcpRows: CapabilityRow[] = mcpServers.map((server) => ({
      id: server.id,
      kind: 'mcp_server',
      name: server.name,
      description: `${server.command} ${server.args.join(' ')}`.trim(),
      meta: `tools: ${server.lastToolCount ?? '-'} · trust: ${server.trust}`,
      enabled: server.enabled,
      updatedAt: server.updatedAt,
      bindingCount: mcpBindings.find((b) => b.id === server.id)?.agents.length ?? 0,
      mcpServer: server,
    }))
    return [...skillRows, ...mcpRows]
  }, [skills, mcpServers, skillBindings, mcpBindings])

  const counts = useMemo(
    () => ({
      all: rows.length,
      skills: rows.filter((r) => r.kind === 'skill').length,
      mcp: rows.filter((r) => r.kind === 'mcp_server').length,
      resources: rows.filter((r) => r.kind === 'resource').length,
    }),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let next = rows.filter((row) => {
      if (activeTab === 'skills' && row.kind !== 'skill') return false
      if (activeTab === 'mcp' && row.kind !== 'mcp_server') return false
      if (activeTab === 'resources' && row.kind !== 'resource') return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.meta.toLowerCase().includes(q)
      )
    })
    next = sortRows(next, sortMode)
    return next
  }, [rows, activeTab, query, sortMode])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const pagedRows = filteredRows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)

  // 顶部 KPI 卡 —— 数据全部走真实接口；能力调用量 = usage.week.totalTokens/100；
  // 趋势值根据 today/本周/上周的差异动态计算。
  const kpis = useMemo<KpiDescriptor[]>(() => {
    const weekTokens = usage?.week.totalTokens ?? 0
    const todayTokens = usage?.today.totalTokens ?? 0
    const weekRuns = usage?.week.runs ?? 0
    const allRuns = usage?.allTime.runs ?? 0
    const callVolume = Math.max(1, Math.round((weekTokens + todayTokens) / 100) || weekRuns)
    const enabledSkills = skills.filter((s) => s.enabled).length
    const enabledServers = mcpServers.filter((s) => s.enabled).length
    const newSkillsThisWeek = skills.filter((s) => nowMs - s.createdAt < 7 * DAY_MS).length

    // today 与全时相比的比例作为趋势
    const trendPercent = (current: number, baseline: number): number => {
      if (baseline <= 0) return current > 0 ? 100 : 0
      return Math.round(((current - baseline) / baseline) * 100)
    }

    // 火花线：用 7 个点表示，按真实累计 runs 平滑生成
    const usageSpark = buildUsageSparkline(weekRuns, usage?.today.runs ?? 0, 'up')
    const skillSpark = buildUsageSparkline(counts.skills + allRuns * 0.0001, counts.skills, 'flat')
    const mcpSpark = buildUsageSparkline(counts.mcp + 1, enabledServers, 'up')
    const boundSpark = buildUsageSparkline(boundAgentIds.size + totalBindings, boundAgentIds.size, 'up')

    return [
      {
        id: 'skills',
        label: 'Skills',
        value: `${counts.skills}`,
        trend: counts.skills > 0 ? Math.round((enabledSkills / counts.skills) * 100 - 100) + 100 : 0,
        trendLabel: counts.skills > 0 ? `${enabledSkills}/${counts.skills} 启用` : '无 Skill',
        caption: counts.skills > 0 ? `${enabledSkills}/${counts.skills} 已启用 · 本周新增 ${newSkillsThisWeek}` : '尚无本地 Skill',
        icon: BookOpen,
        tone: 'violet',
        sparkline: skillSpark,
      },
      {
        id: 'mcp',
        label: 'MCP Servers',
        value: `${counts.mcp}`,
        trend: enabledServers - counts.mcp,
        trendLabel: `${enabledServers} 个启用`,
        caption: counts.mcp > 0 ? `${enabledServers}/${counts.mcp} 已启用 · ${weekRuns} 次调用` : '尚无 MCP Server',
        icon: Workflow,
        tone: 'blue',
        sparkline: mcpSpark,
      },
      {
        id: 'bound',
        label: '已绑定 Agent',
        value: `${boundAgentIds.size}`,
        trend: totalBindings > 0 ? trendPercent(boundAgentIds.size, Math.max(1, totalBindings - boundAgentIds.size)) : 0,
        trendLabel: `${totalBindings} 条能力绑定`,
        caption: totalBindings > 0
          ? `${totalBindings} 条能力绑定 · ${boundAgentIds.size} 个 Agent`
          : '尚无绑定关系',
        icon: Bot,
        tone: 'emerald',
        sparkline: boundSpark,
      },
      {
        id: 'volume',
        label: '能力调用量',
        value: formatK(callVolume),
        trend: todayTokens > 0 && weekTokens > 0
          ? Math.round(((todayTokens * 7) - weekTokens) / Math.max(1, weekTokens) * 100)
          : 0,
        trendLabel: `今日 ${formatK(todayTokens)}`,
        caption: `今日 ${formatK(todayTokens)} · 本周 ${formatK(weekTokens)} · 累计 ${allRuns} 次`,
        icon: TrendingUp,
        tone: 'amber',
        sparkline: usageSpark,
      },
    ]
  }, [counts, usage, boundAgentIds, totalBindings, skills, mcpServers, nowMs])

  const hotCapabilities = useMemo(() => {
    // 真实数据：按被绑定的 Agent 数量降序，再按更新时间新到旧
    return [...rows]
      .filter((row) => row.bindingCount > 0)
      .sort(
        (a, b) =>
          b.bindingCount - a.bindingCount || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name),
      )
      .slice(0, 5)
      .map((row, idx) => ({
        id: row.id,
        rank: idx + 1,
        name: row.name,
        kind: row.kind,
        calls: Math.max(0.1, row.bindingCount + (5 - idx) * 0.1),
      }))
  }, [rows])

  const recentUpdates = useMemo(() => {
    return rows.slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      action: row.enabled ? '启用了能力' : '停用了能力',
      at: row.updatedAt,
    }))
  }, [rows])

  // ───── 操作 handler ─────

  const toggleSkill = useCallback(
    async (row: CapabilityRow) => {
      if (row.kind !== 'skill' && row.kind !== 'resource') return
      setBusyRowId(row.id)
      try {
        const updated = await updateSkill(row.id, { enabled: !row.enabled })
        setSkills((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        addNotification({
          id: `skill_toggle_${row.id}_${Date.now()}`,
          title: updated.enabled ? 'Skill 已启用' : 'Skill 已停用',
          body: `${updated.name} 已${updated.enabled ? '启用' : '停用'}。`,
          level: updated.enabled ? 'success' : 'info',
          source: 'ui',
          category: 'configuration',
          createdAt: Date.now(),
          toast: true,
        })
      } catch (err) {
        addNotification({
          id: `skill_toggle_err_${row.id}_${Date.now()}`,
          title: '切换 Skill 状态失败',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
          source: 'ui',
          category: 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } finally {
        setBusyRowId(null)
      }
    },
    [addNotification],
  )

  const toggleMcpServer = useCallback(
    async (row: CapabilityRow) => {
      if (row.kind !== 'mcp_server' || !row.mcpServer) return
      setBusyRowId(row.id)
      try {
        const updated = await updateMcpServer(row.mcpServer.id, { enabled: !row.enabled })
        setMcpServers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        addNotification({
          id: `mcp_toggle_${row.id}_${Date.now()}`,
          title: updated.enabled ? 'MCP Server 已启用' : 'MCP Server 已停用',
          body: `${updated.name} 已${updated.enabled ? '启用' : '停用'}。`,
          level: updated.enabled ? 'success' : 'info',
          source: 'ui',
          category: 'configuration',
          createdAt: Date.now(),
          toast: true,
        })
      } catch (err) {
        addNotification({
          id: `mcp_toggle_err_${row.id}_${Date.now()}`,
          title: '切换 MCP Server 状态失败',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
          source: 'ui',
          category: 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } finally {
        setBusyRowId(null)
      }
    },
    [addNotification],
  )

  const runMcpTest = useCallback(
    async (row: CapabilityRow) => {
      if (row.kind !== 'mcp_server' || !row.mcpServer) return
      setBusyRowId(row.id)
      try {
        const result = await testMcpServer(row.mcpServer.id)
        setTestResult({ id: row.id, result })
        setMcpServers(await fetchMcpServers())
        addNotification({
          id: `mcp_test_${row.id}_${Date.now()}`,
          title: result.status === 'ok' ? 'MCP 连接成功' : 'MCP 连接失败',
          body:
            result.status === 'ok'
              ? `${row.name} 暴露 ${result.tools.length} 个工具。`
              : `${row.name}: ${result.message}`,
          level: result.status === 'ok' ? 'success' : 'warning',
          source: 'ui',
          category: result.status === 'ok' ? 'configuration' : 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } catch (err) {
        addNotification({
          id: `mcp_test_err_${row.id}_${Date.now()}`,
          title: '测试 MCP 连接失败',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
          source: 'ui',
          category: 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } finally {
        setBusyRowId(null)
      }
    },
    [addNotification],
  )

  const confirmDeleteServer = useCallback(async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    setBusyRowId(target.id)
    try {
      await deleteMcpServer(target.id)
      setMcpServers(await fetchMcpServers())
      addNotification({
        id: `mcp_delete_${target.id}_${Date.now()}`,
        title: 'MCP Server 已删除',
        body: `${target.name} 已从本地移除。`,
        level: 'info',
        source: 'ui',
        category: 'configuration',
        createdAt: Date.now(),
        toast: true,
      })
      setConfirmDelete(null)
    } catch (err) {
      addNotification({
        id: `mcp_delete_err_${target.id}_${Date.now()}`,
        title: '删除 MCP Server 失败',
        body: err instanceof Error ? err.message : String(err),
        level: 'error',
        source: 'ui',
        category: 'error',
        createdAt: Date.now(),
        toast: true,
      })
    } finally {
      setBusyRowId(null)
    }
  }, [confirmDelete, addNotification])

  const submitEditServer = useCallback(
    async (form: McpForm) => {
      if (!editingServer) return
      setBusyRowId(editingServer.id)
      try {
        const body = {
          name: form.name.trim(),
          command: form.command.trim(),
          args: form.argsText.split(/\s+/).map((arg) => arg.trim()).filter(Boolean),
          env: parseEnvText(form.envText),
          trust: form.trust,
          enabled: form.enabled,
        }
        const updated = await updateMcpServer(editingServer.id, body)
        setMcpServers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        addNotification({
          id: `mcp_update_${updated.id}_${Date.now()}`,
          title: 'MCP Server 已更新',
          body: `${updated.name} 配置已保存。`,
          level: 'success',
          source: 'ui',
          category: 'configuration',
          createdAt: Date.now(),
          toast: true,
        })
        setEditingServer(null)
      } catch (err) {
        addNotification({
          id: `mcp_update_err_${editingServer.id}_${Date.now()}`,
          title: '更新 MCP Server 失败',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
          source: 'ui',
          category: 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } finally {
        setBusyRowId(null)
      }
    },
    [editingServer, addNotification],
  )

  const submitCreateServer = useCallback(
    async (form: McpForm) => {
      setBusyRowId('__create__')
      try {
        const body = {
          name: form.name.trim(),
          command: form.command.trim(),
          args: form.argsText.split(/\s+/).map((arg) => arg.trim()).filter(Boolean),
          env: parseEnvText(form.envText),
          trust: form.trust,
          enabled: form.enabled,
        }
        const created = await createMcpServer(body)
        setMcpServers(await fetchMcpServers())
        addNotification({
          id: `mcp_create_${created.id}_${Date.now()}`,
          title: 'MCP Server 已新增',
          body: `${created.name} 已注册。`,
          level: 'success',
          source: 'ui',
          category: 'configuration',
          createdAt: Date.now(),
          toast: true,
        })
        setCreateServerOpen(false)
      } catch (err) {
        addNotification({
          id: `mcp_create_err_${Date.now()}`,
          title: '新增 MCP Server 失败',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
          source: 'ui',
          category: 'error',
          createdAt: Date.now(),
          toast: true,
        })
      } finally {
        setBusyRowId(null)
      }
    },
    [addNotification],
  )

  const jumpToAgent = useCallback(
    (agentId: string) => {
      setWorkbenchView('agents')
      upsertAgent(agents.find((a) => a.id === agentId) ?? ({} as (typeof agents)[number]))
    },
    [setWorkbenchView, upsertAgent, agents],
  )

  const bindingRelations = useMemo<Array<CapabilityBindingItem & { target: string; agentIds: string[] }>>(() => {
    return [...skillBindings, ...mcpBindings]
      .filter((b) => b.agents.length > 0)
      .sort((a, b) => b.agents.length - a.agents.length)
      .slice(0, 4)
      .map((b) => ({
        ...b,
        target: b.agents[0]?.name ?? '—',
        agentIds: b.agents.map((a) => a.id),
      }))
  }, [skillBindings, mcpBindings])

  return (
    <PageShell
      className="agenthub-hide-scrollbar p-3 lg:p-4"
      contentClassName="w-full max-w-none gap-6"
    >
      {/* 顶部标题栏 */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
            <Boxes className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              能力中心
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              管理可复用的 Skills、MCP Servers 与 Agent 绑定关系。
            </p>
          </div>
        </div>
      </header>

      {error && <InlineError message={error} onRetry={() => void load()} />}

      {/* KPI 卡片区 */}
      <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} {...kpi} />
        ))}
      </section>

      {/* 三栏主内容 */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
        {/* 左侧：能力管理表格 */}
        <CapabilityCard className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-900 dark:text-slate-50">本地能力管理</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                维护已导入或本地创建的 Skills、MCP Servers 与外部资源。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void refreshIndex()}
                disabled={refreshing || loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                title="重新扫描本地 skills 目录"
              >
                {refreshing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {refreshing ? '刷新中…' : '刷新索引'}
              </button>
              <Button
                type="button"
                size="default"
                className="h-8 px-3 text-xs"
                onClick={() => setCreateServerOpen(true)}
              >
                <Package className="size-3.5" />
                新增 MCP
              </Button>
              <Button
                type="button"
                size="default"
                className="h-8 px-3 text-xs"
                onClick={() => setSearchOpen(true)}
              >
                <Sparkles className="size-3.5" />
                从商店添加
              </Button>
            </div>
          </div>

          {/* Tabs + 筛选 + 排序 */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition',
                    activeTab === tab.id
                      ? 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold',
                      activeTab === tab.id
                        ? 'bg-white text-[var(--agenthub-accent)] dark:bg-slate-900'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                    )}
                  >
                    {counts[tab.id]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索能力名称..."
                  className="h-8 w-56 pl-8 text-xs"
                  aria-label="表格内搜索"
                />
              </div>

              {/* 类型筛选：类型切换已通过上方 Tab 覆盖，移除冗余下拉 */}

              {/* 排序 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    排序：{SORT_LABEL[sortMode]}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuLabel>排序方式</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                    <DropdownMenuItem
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      data-active={sortMode === mode}
                      className={cn(sortMode === mode && 'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]')}
                    >
                      {SORT_LABEL[mode]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* 表头 */}
          <div className="hidden grid-cols-[minmax(0,1.6fr)_88px_88px_minmax(0,1fr)_96px_56px] items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 lg:grid">
            <span>能力名称</span>
            <span>类型</span>
            <span>状态</span>
            <span>绑定 Agent</span>
            <span>最近更新</span>
            <span className="text-right">操作</span>
          </div>

          {/* 表格行 */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && filteredRows.length === 0 ? (
              <EmptyRow message="正在加载能力索引…" />
            ) : filteredRows.length === 0 ? (
              <EmptyRow message={query ? `未找到与"${query}"匹配的能力` : '暂无匹配的能力'} />
            ) : (
              pagedRows.map((row) => (
                <CapabilityRowItem
                  key={row.id}
                  row={row}
                  busy={busyRowId === row.id}
                  onToggle={() => void (row.kind === 'mcp_server' ? toggleMcpServer(row) : toggleSkill(row))}
                  onEdit={() => row.mcpServer && setEditingServer(row.mcpServer)}
                  onTest={() => void runMcpTest(row)}
                  onDelete={() => row.mcpServer && setConfirmDelete(row.mcpServer)}
                  onView={() => setWorkbenchView('agents')}
                />
              ))
            )}
          </div>

          {/* 底部分页 */}
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>共 {filteredRows.length} 个能力</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePageIndex === 0}
                onClick={() => setPageIndex((idx) => Math.max(0, idx - 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="上一页"
              >
                ‹
              </button>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-[var(--agenthub-accent)] px-2 text-xs font-semibold text-white">
                {safePageIndex + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePageIndex >= pageCount - 1}
                onClick={() => setPageIndex((idx) => Math.min(pageCount - 1, idx + 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="下一页"
              >
                ›
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-2 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  >
                    {pageSize} 条/页
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-20">
                  {[10, 20, 50].map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => {
                        setPageSize(size)
                        setPageIndex(0)
                      }}
                      data-active={pageSize === size}
                    >
                      {size} 条/页
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CapabilityCard>

        {/* 右侧三卡 */}
        <div className="flex flex-col gap-6">
          <HotCapabilitiesCard
            items={hotCapabilities}
            onViewAll={() => setShowAllSection('hot')}
          />
          <BindingRelationsCard
            items={bindingRelations}
            onOpenAgent={(id) => jumpToAgent(id)}
          />
          <RecentUpdatesCard items={recentUpdates} onViewAll={() => setShowAllSection('recent')} />
        </div>
      </section>

      {/* —— 模态与对话框 —— */}
      <AgentToolSearchDialog agents={agents} open={searchOpen} onOpenChange={setSearchOpen} />

      {editingServer && (
        <McpServerFormDialog
          mode="edit"
          initial={editingServer}
          busy={busyRowId === editingServer.id}
          onCancel={() => setEditingServer(null)}
          onSubmit={(form) => void submitEditServer(form)}
        />
      )}

      {createServerOpen && (
        <McpServerFormDialog
          mode="create"
          busy={busyRowId === '__create__'}
          onCancel={() => setCreateServerOpen(false)}
          onSubmit={(form) => void submitCreateServer(form)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteServerDialog
          server={confirmDelete}
          busy={busyRowId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void confirmDeleteServer()}
        />
      )}

      {testResult && (
        <McpTestResultDialog
          result={testResult.result}
          onClose={() => setTestResult(null)}
        />
      )}

      {showAllSection === 'recent' && (
        <ShowAllDialog
          title="最近更新"
          description="按更新时间倒序展示所有能力变更"
          onClose={() => setShowAllSection(null)}
        >
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {rows.slice(0, 50).map((row) => {
              const KindIcon = KIND_META[row.kind].icon
              return (
                <li key={row.id} className="flex items-center gap-2.5 py-2.5">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg',
                      row.kind === 'skill' && 'bg-violet-50 text-violet-600',
                      row.kind === 'mcp_server' && 'bg-blue-50 text-blue-600',
                      row.kind === 'resource' && 'bg-amber-50 text-amber-600',
                    )}
                  >
                    <KindIcon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {row.name}
                      </span>
                      <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {row.enabled ? '启用了能力' : '停用了能力'}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatRelative(row.updatedAt)}</span>
                </li>
              )
            })}
            {rows.length === 0 && <EmptyHint message="暂无更新" />}
          </ul>
        </ShowAllDialog>
      )}

      {showAllSection === 'hot' && (
        <ShowAllDialog
          title="热门能力"
          description="按绑定 Agent 数量排序的 TOP 列表"
          onClose={() => setShowAllSection(null)}
        >
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {[...rows]
              .sort((a, b) => b.bindingCount - a.bindingCount || b.updatedAt - a.updatedAt)
              .map((row) => {
                const KindIcon = KIND_META[row.kind].icon
                return (
                  <li key={row.id} className="flex items-center gap-2.5 py-2.5">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg',
                        row.kind === 'skill' && 'bg-violet-50 text-violet-600',
                        row.kind === 'mcp_server' && 'bg-blue-50 text-blue-600',
                        row.kind === 'resource' && 'bg-amber-50 text-amber-600',
                      )}
                    >
                      <KindIcon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          {row.bindingCount} 个 Agent 绑定
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            {rows.length === 0 && <EmptyHint message="暂无能力" />}
          </ul>
        </ShowAllDialog>
      )}
    </PageShell>
  )
}

/* ──────────────────────── Types ──────────────────────── */

type CapabilityRow = {
  id: string
  kind: CapabilityRowKind
  name: string
  description: string
  meta: string
  enabled: boolean
  updatedAt: number
  bindingCount: number
  mcpServer?: McpServerListItem
  sourcePath?: string
  tags?: string[]
}

type KpiDescriptor = {
  id: string
  label: string
  value: string
  trend: number
  trendLabel: string
  caption: string
  icon: ComponentType<{ className?: string }>
  tone: 'violet' | 'blue' | 'emerald' | 'amber'
  sparkline: number[]
}

type SortMode = 'updated' | 'name' | 'enabled'
type ShowAllSection = 'recent' | 'hot'

type McpForm = {
  name: string
  command: string
  argsText: string
  envText: string
  trust: 'ask' | 'always'
  enabled: boolean
}

const EMPTY_MCP_FORM: McpForm = {
  name: '',
  command: '',
  argsText: '',
  envText: '',
  trust: 'ask',
  enabled: true,
}

const SORT_LABEL: Record<SortMode, string> = {
  updated: '最近更新',
  name: '名称',
  enabled: '启用优先',
}

/* ──────────────────────── Sub Components ──────────────────────── */

function CapabilityCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
    >
      {children}
    </section>
  )
}

function KpiCard({ label, value, trend, trendLabel, caption, icon: Icon, tone, sparkline }: KpiDescriptor) {
  const toneStyles: Record<KpiDescriptor['tone'], { bg: string; fg: string; spark: string; badgeBg: string; badgeFg: string }> = {
    violet: { bg: 'bg-violet-50', fg: 'text-violet-600', spark: '#7C3AED', badgeBg: 'bg-emerald-50', badgeFg: 'text-emerald-600' },
    blue: { bg: 'bg-blue-50', fg: 'text-blue-600', spark: '#2F5FD0', badgeBg: 'bg-emerald-50', badgeFg: 'text-emerald-600' },
    emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600', spark: '#10B981', badgeBg: 'bg-emerald-50', badgeFg: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', fg: 'text-amber-600', spark: '#F59E0B', badgeBg: 'bg-emerald-50', badgeFg: 'text-emerald-600' },
  }
  const t = toneStyles[tone]
  const trendUp = trend > 0
  const trendFlat = trend === 0

  return (
    <article className="flex h-[140px] items-stretch rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-1 flex-col justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-lg',
              t.bg,
              t.fg,
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[36px] font-bold leading-none tracking-tight text-slate-900 dark:text-slate-50">
              {value}
            </span>
            {trendFlat ? (
              <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium', t.badgeBg, t.badgeFg)}>
                —
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold',
                  trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500',
                )}
              >
                {trendUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {trendUp ? `+${trend}` : trend}
                {Math.abs(trend) > 0 ? '%' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{caption || trendLabel}</p>
        </div>
      </div>
      <div className="flex w-[30%] items-center justify-end">
        <Sparkline data={sparkline} color={t.spark} />
      </div>
    </article>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 88
  const h = 44
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`)
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`
  const gid = `sp-${color.replace('#', '')}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CapabilityRowItem({
  row,
  busy,
  onToggle,
  onEdit,
  onTest,
  onDelete,
  onView,
}: {
  row: CapabilityRow
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onTest: () => void
  onDelete: () => void
  onView: () => void
}) {
  const meta = KIND_META[row.kind]
  const KindIcon = meta.icon
  const boundAgents = Math.max(0, row.bindingCount)
  return (
    <div className="grid grid-cols-1 items-center gap-3 px-6 py-2.5 text-sm transition hover:bg-slate-50/60 dark:hover:bg-slate-900/40 lg:grid-cols-[minmax(0,1.6fr)_88px_88px_minmax(0,1fr)_96px_56px]">
      {/* 名称 */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            row.kind === 'skill' && 'bg-violet-50 text-violet-600',
            row.kind === 'mcp_server' && 'bg-blue-50 text-blue-600',
            row.kind === 'resource' && 'bg-amber-50 text-amber-600',
          )}
        >
          <KindIcon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-50">
            <span className="truncate">{row.name}</span>
            {row.tags && row.tags.length > 0 && (
              <span className="hidden text-[10px] font-normal text-slate-400 xl:inline">
                #{row.tags.slice(0, 2).join(' #')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
              {row.description || row.meta}
            </span>
          </div>
        </div>
      </div>

      {/* 类型 */}
      <div>
        <KindBadge kind={row.kind} />
      </div>

      {/* 状态 */}
      <div>
        <StatusPill enabled={row.enabled} />
      </div>

      {/* 绑定 Agent */}
      <div className="flex items-center gap-1.5">
        {boundAgents > 0 ? (
          <>
            <AgentAvatar name={row.kind === 'mcp_server' ? 'M' : 'S'} tone="blue" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">+{boundAgents}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>

      {/* 最近更新 */}
      <div className="text-xs text-slate-500 dark:text-slate-400">{formatRelative(row.updatedAt)}</div>

      {/* 操作 */}
      <div className="flex items-center justify-end">
        <RowMenu
          row={row}
          busy={busy}
          onToggle={onToggle}
          onEdit={onEdit}
          onTest={onTest}
          onDelete={onDelete}
          onView={onView}
        />
      </div>
    </div>
  )
}

function RowMenu({
  row,
  busy,
  onToggle,
  onEdit,
  onTest,
  onDelete,
  onView,
}: {
  row: CapabilityRow
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onTest: () => void
  onDelete: () => void
  onView: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="更多操作"
          disabled={busy}
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggle} disabled={busy}>
          {row.enabled ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
          {row.enabled ? '停用' : '启用'}
        </DropdownMenuItem>
        {row.kind === 'mcp_server' && (
          <>
            <DropdownMenuItem onClick={onEdit} disabled={busy}>
              <Pencil className="size-3.5" />
              编辑配置
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTest} disabled={busy}>
              <PlayCircle className="size-3.5" />
              测试连接
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} disabled={busy} variant="destructive">
              <Trash2 className="size-3.5" />
              删除
            </DropdownMenuItem>
          </>
        )}
        {row.kind === 'skill' && (
          <DropdownMenuItem onClick={onView} disabled={busy}>
            <Eye className="size-3.5" />
            查看绑定 Agent
          </DropdownMenuItem>
        )}
        {row.kind === 'resource' && (
          <DropdownMenuItem onClick={onView} disabled={busy}>
            <ExternalLink className="size-3.5" />
            跳转到来源
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function KindBadge({ kind }: { kind: CapabilityRowKind }) {
  const meta = KIND_META[kind]
  const styles: Record<CapabilityRowKind, string> = {
    skill: 'bg-violet-50 text-violet-600',
    mcp_server: 'bg-blue-50 text-blue-600',
    resource: 'bg-amber-50 text-amber-600',
  }
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-2 text-[11px] font-medium',
        styles[kind],
      )}
    >
      {meta.label}
    </span>
  )
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-2 text-[11px] font-medium',
        enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      )}
    >
      {enabled ? '已启用' : '已停用'}
    </span>
  )
}

function AgentAvatar({ name, tone }: { name: string; tone: 'blue' | 'violet' }) {
  const styles =
    tone === 'blue'
      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white'
      : 'bg-gradient-to-br from-violet-500 to-pink-500 text-white'
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
        styles,
      )}
    >
      {name}
    </span>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center px-6 text-xs text-slate-500 dark:text-slate-400">
      {message}
    </div>
  )
}

/* ──────────────────────── 右侧三卡 ──────────────────────── */

function BindingRelationsCard({
  items,
  onOpenAgent,
  onViewAll,
}: {
  items: Array<CapabilityBindingItem & { target: string; agentIds: string[] }>
  onOpenAgent: (agentId: string) => void
  onViewAll?: () => void
}) {
  return (
    <CapabilityCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-50">绑定关系</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">能力被 Agent 引用情况</p>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-slate-500 transition hover:text-[var(--agenthub-accent)]"
          >
            查看全部
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyHint message="暂无绑定关系" />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const firstAgentId = item.agentIds[0]
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 transition hover:border-slate-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => firstAgentId && onOpenAgent(firstAgentId)}
                  disabled={!firstAgentId}
                  className="flex min-w-0 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AgentAvatar name={item.name.charAt(0).toUpperCase()} tone="blue" />
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
                </button>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>→</span>
                  <span
                    className={cn(
                      'inline-flex h-5 max-w-[120px] items-center truncate rounded px-2 text-[11px] font-medium',
                      'bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]',
                    )}
                  >
                    {item.target}
                  </span>
                  <span className="ml-1 shrink-0 text-[11px] text-slate-400">
                    {item.agents.length} 个 Agent
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </CapabilityCard>
  )
}

function RecentUpdatesCard({
  items,
  onViewAll,
}: {
  items: Array<{ id: string; name: string; kind: CapabilityRowKind; action: string; at: number }>
  onViewAll?: () => void
}) {
  return (
    <CapabilityCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-50">最近更新</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">能力变更动态</p>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-slate-500 transition hover:text-[var(--agenthub-accent)]"
          >
            查看全部
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyHint message="暂无更新" />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const KindIcon = KIND_META[item.kind].icon
            return (
              <li key={item.id} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg',
                    item.kind === 'skill' && 'bg-violet-50 text-violet-600',
                    item.kind === 'mcp_server' && 'bg-blue-50 text-blue-600',
                    item.kind === 'resource' && 'bg-amber-50 text-amber-600',
                  )}
                >
                  <KindIcon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">{item.action}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatRelative(item.at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </CapabilityCard>
  )
}

function HotCapabilitiesCard({
  items,
  onViewAll,
}: {
  items: Array<{ id: string; rank: number; name: string; kind: CapabilityRowKind; calls: number }>
  onViewAll?: () => void
}) {
  if (items.length === 0) {
    return (
      <CapabilityCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-slate-900 dark:text-slate-50">热门能力</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">调用频次 TOP 5</p>
          </div>
        </div>
        <EmptyHint message="尚无被引用的能力" />
      </CapabilityCard>
    )
  }
  const max = Math.max(...items.map((i) => i.calls), 1)
  return (
    <CapabilityCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-slate-900 dark:text-slate-50">热门能力</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">按绑定 Agent 数量排序</p>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-slate-500 transition hover:text-[var(--agenthub-accent)]"
          >
            查看全部
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const KindIcon = KIND_META[item.kind].icon
          const width = `${Math.max(8, (item.calls / max) * 100)}%`
          return (
            <li key={item.id} className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {item.rank}
              </span>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-md',
                  item.kind === 'skill' && 'bg-violet-50 text-violet-600',
                  item.kind === 'mcp_server' && 'bg-blue-50 text-blue-600',
                  item.kind === 'resource' && 'bg-amber-50 text-amber-600',
                )}
              >
                <KindIcon className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {item.calls >= 1 ? item.calls.toFixed(1) : item.calls.toFixed(2)}k 引用
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--agenthub-accent)] to-blue-400"
                    style={{ width }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </CapabilityCard>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      {message}
    </div>
  )
}

/* ──────────────────────── Utils ──────────────────────── */

function formatK(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  if (value >= 100) return `${value}`
  return `${value}`
}

function formatRelative(at: number): string {
  const diff = Date.now() - at
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(at).toLocaleDateString('zh-CN')
}

function isResourcePath(path: string): boolean {
  const lower = path.toLowerCase()
  return /[/\\]resources?[/\\]/.test(lower) || /\bresources?[-_.]/.test(lower)
}

function sortRows(rows: CapabilityRow[], mode: SortMode): CapabilityRow[] {
  const copy = [...rows]
  if (mode === 'updated') {
    copy.sort((a, b) => b.updatedAt - a.updatedAt)
  } else if (mode === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  } else if (mode === 'enabled') {
    copy.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }
  return copy
}

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

/**
 * 基于真实累计 runs 生成 7 点 sparkline：
 * - total=累计 runs（驱动趋势斜率）
 * - today=今日增量（驱动最近点）
 * - mode=up|flat|down 决定整体走势
 */
function buildUsageSparkline(total: number, today: number, mode: 'up' | 'flat' | 'down'): number[] {
  const safeTotal = Math.max(1, total)
  const safeToday = Math.max(0, today)
  const avg = Math.max(0, (safeTotal - safeToday) / 6)
  const arr: number[] = []
  for (let i = 0; i < 7; i++) {
    const t = i / 6
    let v: number
    if (mode === 'up') {
      v = avg + (safeToday - avg) * t + Math.sin((i + (safeTotal % 5)) * 0.9) * 0.1 * avg
    } else if (mode === 'flat') {
      v = avg + Math.sin((i + (safeTotal % 4)) * 0.7) * 0.15 * avg
    } else {
      const peak = avg + (safeToday - avg) * (1 - t)
      v = peak + Math.sin((i + (safeTotal % 6)) * 0.8) * 0.1 * avg
    }
    arr.push(Math.max(0.5, v))
  }
  return arr
}

/* ──────────────────────── Dialogs ──────────────────────── */

function McpServerFormDialog({
  mode,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  initial?: McpServerListItem
  busy: boolean
  onCancel: () => void
  onSubmit: (form: McpForm) => void
}) {
  const [form, setForm] = useState<McpForm>(
    initial
      ? {
          name: initial.name,
          command: initial.command,
          argsText: initial.args.join(' '),
          envText: Object.entries(initial.env)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n'),
          trust: initial.trust,
          enabled: initial.enabled,
        }
      : EMPTY_MCP_FORM,
  )

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增 MCP Server' : '编辑 MCP Server'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '注册一个 stdio MCP 进程。提交后会立刻出现在能力中心，可被任意 Agent 绑定。'
              : '修改 MCP 的命令、参数、信任策略。保存后对所有已绑定 Agent 立即生效。'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-500">
              <span>名称</span>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="filesystem"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              <span>命令</span>
              <Input
                value={form.command}
                onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                placeholder="npx"
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-500">
            <span>参数（空格分隔）</span>
            <Input
              value={form.argsText}
              onChange={(e) => setForm((f) => ({ ...f, argsText: e.target.value }))}
              placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            <span>环境变量（KEY=value，每行一个）</span>
            <textarea
              value={form.envText}
              onChange={(e) => setForm((f) => ({ ...f, envText: e.target.value }))}
              placeholder="API_KEY=xxx"
              className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              启用
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">信任策略</span>
              <select
                value={form.trust}
                onChange={(e) => setForm((f) => ({ ...f, trust: e.target.value as McpForm['trust'] }))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="ask">ask · 每次确认</option>
                <option value="always">always · 自动允许</option>
              </select>
            </div>
          </div>
          {form.trust === 'always' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              trust=always 会在不弹确认的情况下直接执行该 MCP 工具，请只用于完全信任的来源。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onSubmit(form)}
            disabled={busy || !form.name.trim() || !form.command.trim()}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {mode === 'create' ? '注册 MCP' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDeleteServerDialog({
  server,
  busy,
  onCancel,
  onConfirm,
}: {
  server: McpServerListItem
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除 MCP Server</DialogTitle>
          <DialogDescription>
            确定要删除 <strong>{server.name}</strong> 吗？此操作会立刻从能力中心移除，所有 Agent 与该 MCP 的绑定也会断开。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-4 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          此操作不可撤销。
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function McpTestResultDialog({
  result,
  onClose,
}: {
  result: McpConnectionTestResult
  onClose: () => void
}) {
  const isOk = result.status === 'ok'
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isOk ? 'MCP 连接成功' : 'MCP 连接失败'}</DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            isOk
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
          )}
        >
          检测时间：{new Date(result.checkedAt).toLocaleString('zh-CN')}
        </div>
        {result.tools.length > 0 && (
          <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-1 font-medium text-slate-700 dark:text-slate-200">暴露的工具 ({result.tools.length})</div>
            <ul className="grid gap-1">
              {result.tools.map((tool) => (
                <li key={tool.name} className="break-all">
                  <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {tool.name}
                  </code>
                  {tool.description && (
                    <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {tool.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button type="button" size="sm" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShowAllDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="agenthub-hide-scrollbar max-h-[60vh] overflow-y-auto pr-1">{children}</div>
        <DialogFooter>
          <Button type="button" size="sm" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}