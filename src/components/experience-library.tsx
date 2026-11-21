'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Search,
  Layers,
  CheckCircle2,
  FileText,
  Snowflake,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Filter,
  PanelRight,
  Plus,
  Users,
  Loader2,
} from 'lucide-react'
import type { ExperienceKind, ExperienceRow } from '@/db/schema'
import {
  createExperience,
  deleteExperience,
  fetchExperienceStats,
  fetchExperiences,
  updateExperience,
  type ExperienceStats,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/experience/stat-card'
import { ExperienceCard } from '@/components/experience/experience-card'
import { ExperienceSidebar } from '@/components/experience/experience-sidebar'
import { ExperienceDetail } from '@/components/experience/experience-detail'
import { ExperienceEditor } from '@/components/experience/experience-editor'
import { ExperienceCreateDialog } from '@/components/experience/experience-create-dialog'
import { EmptyState, PageHeader, PageShell } from '@/components/workbench-primitives'
import { DIALOG_SIZE_CLASS } from '@/components/dialog-sizes'
import { useIsBelowLg } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<ExperienceKind, string> = {
  experience: '经验',
  reflection: '反思',
  profile_fact: '画像',
}

const EMPTY_STATS: ExperienceStats = {
  total: 0, active: 0, drafts: 0, frequentlyUsed: 0, cold: 0, totalUsage: 0, weeklyNew: [], weeklyUsage: [],
}

interface ExperienceLibraryProps {
  agents?: { id: string; name: string }[]
}

function calcTrend(data: number[] | undefined): number | undefined {
  if (!data || data.length < 6) return undefined
  const recent = data.slice(-3).reduce((a, b) => a + b, 0)
  const prev = data.slice(-6, -3).reduce((a, b) => a + b, 0)
  if (prev === 0) return recent > 0 ? 100 : undefined
  return Math.round(((recent - prev) / prev) * 100)
}

export function ExperienceLibrary({ agents = [] }: ExperienceLibraryProps) {
  const [items, setItems] = useState<ExperienceRow[]>([])
  // experienceId → 累计被迭代的次数（Agent 自动复盘修订 + 人工编辑）
  const [revisionCounts, setRevisionCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<ExperienceStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | ExperienceKind>('all')
  const [scopeTab, setScopeTab] = useState<'all' | 'agent' | 'global'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'draft'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'auto' | 'manual'>('all')
  const [groupByAgent, setGroupByAgent] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // D2：低于 lg（<1024px）时右侧栏不走内联侧栏，改走下方的 Dialog；≥lg 行为不变。
  const isBelowLg = useIsBelowLg()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // B3：统计条默认收起为一行摘要（列表提前约 120px @1366 / 约 290px @390），点开展开 5 张卡。
  const [statsOpen, setStatsOpen] = useState(false)

  const agentName = (id: string | null): string => {
    if (!id) return '全局'
    return agents.find((a) => a.id === id)?.name ?? '未知 Agent'
  }

  const refresh = async () => {
    setLoading(true)
    try {
      const [list, stat] = await Promise.all([
        fetchExperiences({
          kind: kindFilter === 'all' ? null : kindFilter,
          active: activeFilter === 'all' ? null : activeFilter === 'active',
          source: sourceFilter === 'all' ? null : sourceFilter,
        }),
        fetchExperienceStats(),
      ])
      setItems(list.experiences)
      setRevisionCounts(list.revisionCounts)
      setStats(stat)
    } catch (err) {
      console.error('[ExperienceLibrary] load failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, activeFilter, sourceFilter])

  const filtered = useMemo(() => {
    let list = items
    // scope 语义：agent=按 Agent 专属（agentId 有值），global=全局共享（agentId 为空）
    if (scopeTab === 'agent') {
      list = list.filter((i) => i.scope === 'agent')
    } else if (scopeTab === 'global') {
      list = list.filter((i) => i.scope === 'global')
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((item) =>
      `${item.title} ${item.trigger} ${item.content} ${item.tags.join(' ')}`.toLowerCase().includes(q),
    )
  }, [items, query, scopeTab])

  const groups = useMemo(() => {
    if (!groupByAgent) return null
    const map = new Map<string | null, ExperienceRow[]>()
    for (const item of filtered) {
      const key = item.agentId
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered, groupByAgent])

  const hasActiveFilter = activeFilter !== 'all' || sourceFilter !== 'all'

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null

  const handleOpen = (id: string) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  const handleEdit = (item: ExperienceRow) => {
    setSelectedId(item.id)
    setEditOpen(true)
  }

  const handleToggleActive = async (item: ExperienceRow) => {
    try {
      const updated = await updateExperience(item.id, { active: !item.active })
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
    } catch (err) {
      console.error('[ExperienceLibrary] toggle failed', err)
    }
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteExperience(deleteTargetId)
      setItems((prev) => prev.filter((it) => it.id !== deleteTargetId))
      setDeleteTargetId(null)
    } catch (err) {
      console.error('[ExperienceLibrary] delete failed', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleCreate = async (data: {
    kind: ExperienceKind; title: string; trigger: string
    content: string; tags: string[]; agentId: string | null; active: boolean
  }) => {
    const row = await createExperience(data)
    await refresh()
    return row
  }

  const handleSaveEdit = async (data: {
    kind: ExperienceKind; title: string; trigger: string
    content: string; tags: string[]; agentId: string | null; active: boolean
  }) => {
    if (!selectedId) return
    await updateExperience(selectedId, data)
    await refresh()
    setEditOpen(false)
  }

  // ─── 列表视图 ───
  return (
    <PageShell className="flex flex-col" contentClassName="w-full max-w-none flex-1 min-h-0">
      {/* W1（batch4 §1）：页头不吸顶——列表走下方内层 ScrollArea，外层 PageShell 不滚动，
          页头/搜索栏/Scope Tab 在 flex 列里本就固定不动；sticky 在此无滚动祖先可依，加了也是死代码。 */}
      <PageHeader
        icon={BookOpen}
        title="经验资产"
        description="沉淀 Agent 运行经验，形成可复用的知识，让 AI 越用越聪明。"
        actions={
          <div className="hidden shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground xl:flex">
            <span>每一次运行，</span>
            <span className="italic text-[var(--agenthub-accent)]">都是下一次更好的开始</span>
          </div>
        }
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

          {/* 统计卡片：B3 默认收起为一行摘要，点开展开 5 张卡；B1 gap 与其余 KPI 区统一为 gap-3 lg:gap-4 */}
          {statsOpen ? (
            <>
              <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[var(--agenthub-border)] px-4 py-4 lg:gap-4 lg:px-6 sm:grid-cols-3 xl:grid-cols-5">
                <StatCard icon={Layers} label="全部" value={stats.total} trend={calcTrend(stats.weeklyNew)} iconBg="bg-[var(--agenthub-accent-soft)]" iconColor="text-[var(--agenthub-accent)]" />
                <StatCard icon={CheckCircle2} label="已启用" value={stats.active} trend={calcTrend(stats.weeklyNew)} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" />
                <StatCard icon={FileText} label="草稿" value={stats.drafts} iconBg="bg-slate-500/10" iconColor="text-slate-500" />
                <StatCard icon={Snowflake} label="冷资产" value={stats.cold} iconBg="bg-amber-500/10" iconColor="text-amber-500" />
                <StatCard icon={TrendingUp} label="累计使用" value={`${stats.totalUsage} 次`} trend={calcTrend(stats.weeklyUsage)} sparkline={stats.weeklyUsage} iconBg="bg-purple-500/10" iconColor="text-purple-500" className="max-sm:col-span-2" />
              </div>
              <div className="flex shrink-0 justify-end border-b border-[var(--agenthub-border)] px-4 py-1.5 lg:px-6">
                <button type="button" onClick={() => setStatsOpen(false)} aria-expanded className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
                  收起统计
                  <ChevronUp className="size-3.5" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              aria-expanded={false}
              className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--agenthub-border)] px-4 py-2.5 text-xs text-muted-foreground transition hover:text-foreground lg:px-6"
            >
              <span className="truncate">
                全部 {stats.total} · 已启用 {stats.active} · 草稿 {stats.drafts} · 冷资产 {stats.cold} · 累计使用 {stats.totalUsage} 次
              </span>
              <span className="flex shrink-0 items-center gap-1">
                展开统计
                <ChevronDown className="size-3.5" />
              </span>
            </button>
          )}

          {/* 搜索 + 筛选 + 操作 */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--agenthub-border)] px-4 py-3 lg:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 text-sm"
                placeholder="搜索经验（标题 / 触发条件 / 内容）"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {/* 类型筛选：accent 胶囊（与信息中心 / 自动化同款） */}
            <div className="flex items-center gap-1" role="group" aria-label="类型筛选">
              {(['all', 'experience', 'reflection', 'profile_fact'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setKindFilter(kind)}
                  aria-pressed={kindFilter === kind}
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium transition',
                    kindFilter === kind
                      ? 'bg-[var(--agenthub-accent)] text-[var(--primary-foreground)]'
                      : 'text-slate-600 hover:bg-[var(--agenthub-surface-muted)] dark:text-slate-300 dark:hover:bg-white/5',
                  )}
                >
                  {kind === 'all' ? '全部' : KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <Button size="sm" variant={groupByAgent ? 'secondary' : 'ghost'} className="h-8 gap-1 text-xs" onClick={() => setGroupByAgent((v) => !v)}>
              <Users className="size-3.5" />
              分组
            </Button>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    size="sm"
                    variant={hasActiveFilter ? 'secondary' : 'ghost'}
                    className="h-8 gap-1 text-xs"
                  />
                }
              >
                <Filter className="size-3.5" />
                筛选
                {hasActiveFilter && <span className="ml-0.5 size-1.5 rounded-full bg-[var(--agenthub-accent)]" />}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 gap-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">状态</div>
                  <div className="flex gap-1">
                    {([['all', '全部'], ['active', '已启用'], ['draft', '草稿']] as const).map(([val, label]) => (
                      <Button
                        key={val}
                        size="sm"
                        variant={activeFilter === val ? 'secondary' : 'ghost'}
                        className="h-7 flex-1 text-xs"
                        onClick={() => setActiveFilter(val)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">来源</div>
                  <div className="flex gap-1">
                    {([['all', '全部'], ['auto', '自动沉淀'], ['manual', '手动创建']] as const).map(([val, label]) => (
                      <Button
                        key={val}
                        size="sm"
                        variant={sourceFilter === val ? 'secondary' : 'ghost'}
                        className="h-7 flex-1 text-xs"
                        onClick={() => setSourceFilter(val)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => { setActiveFilter('all'); setSourceFilter('all') }}
                >
                  重置筛选
                </Button>
              </PopoverContent>
            </Popover>
            {isBelowLg && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setSidebarOpen(true)}>
                <PanelRight className="size-3.5" />
                侧栏
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              新建经验
            </Button>
          </div>

          {/* Scope 切换：分段控件（与 Agent 库侧栏同款；B3 结构收敛以此定稿为准） */}
          <div className="shrink-0 border-b border-[var(--agenthub-border)] px-4 py-2 lg:px-6">
            <div className="inline-flex rounded-md bg-muted p-0.5" role="group" aria-label="范围筛选">
              {([
                ['all', '全部', items.length],
                ['agent', '按 Agent', items.filter((i) => i.scope === 'agent').length],
                ['global', '全局', items.filter((i) => i.scope === 'global').length],
              ] as const).map(([val, label, count]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setScopeTab(val)}
                  aria-pressed={scopeTab === val}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${scopeTab === val ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* 列表 */}
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="space-y-2 p-4 lg:p-6">
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">正在加载经验资产…</div>
                  <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">正在汇总经验、统计与使用情况。</p>
                  <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => void refresh()}>
                    重新加载
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={items.length === 0 ? BookOpen : Search}
                  title={items.length === 0 ? '还没有经验资产' : '无匹配结果'}
                  description={
                    items.length === 0
                      ? '运行几个任务后会自动沉淀，或手动新建一条经验。'
                      : '换个关键词，或清除搜索与筛选条件后再查看。'
                  }
                  action={
                    items.length === 0
                      ? { label: '新建经验', onClick: () => setCreateOpen(true) }
                      : {
                          label: '清除搜索与筛选',
                          onClick: () => {
                            setQuery('')
                            setKindFilter('all')
                            setActiveFilter('all')
                            setSourceFilter('all')
                            setScopeTab('all')
                          },
                        }
                  }
                />
              ) : groupByAgent && groups ? (
                groups.map(([agentId, list]) => (
                  <div key={agentId ?? '__global__'} className="space-y-2">
                    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                      <span className="font-medium">{agentName(agentId)}</span>
                      <span>{list.length} 条</span>
                    </div>
                    {list.map((item) => (
                      <ExperienceCard
                        key={item.id}
                        item={item}
                        agentName={agentName(item.agentId)}
                        revisionCount={revisionCounts[item.id] ?? 0}
                        onOpen={handleOpen}
                        onEdit={handleEdit}
                        onToggleActive={handleToggleActive}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ))
              ) : (
                filtered.map((item) => (
                  <ExperienceCard
                    key={item.id}
                    item={item}
                    agentName={agentName(item.agentId)}
                    revisionCount={revisionCounts[item.id] ?? 0}
                    onOpen={handleOpen}
                    onEdit={handleEdit}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 右侧边栏：D2，<lg 时不占位，改走下方的 Dialog；≥lg 仍用内联侧栏。 */}
        {!isBelowLg && <ExperienceSidebar items={items} onOpen={handleOpen} />}
      </div>

      {/* 新建弹窗 */}
      <ExperienceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        onCreate={handleCreate}
      />

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) setDetailOpen(false) }}>
        <DialogContent className={cn('flex h-[min(86vh,760px)] flex-col gap-0 overflow-hidden p-0', DIALOG_SIZE_CLASS.lg)}>
          {selectedItem && (
            <ExperienceDetail
              item={selectedItem}
              agentName={agentName(selectedItem.agentId)}
              onBack={() => setDetailOpen(false)}
              onEdit={handleEdit}
              onUpdated={(updated) => {
                setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
                void refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* D2：<lg 时右侧栏改在 Dialog 里打开（尺寸走 DIALOG_SIZE_CLASS.md）；≥lg 仍用上面的内联侧栏。 */}
      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent className={cn('flex h-[min(86vh,760px)] flex-col gap-0 overflow-hidden p-0', DIALOG_SIZE_CLASS.md)}>
          <DialogTitle className="sr-only">经验侧栏</DialogTitle>
          <ExperienceSidebar
            items={items}
            onOpen={(id) => { setSidebarOpen(false); handleOpen(id) }}
            className="h-full w-full min-h-0 border-l-0"
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTargetId} onOpenChange={(o) => { if (!o) setDeleteTargetId(null) }}>
        <DialogContent className={DIALOG_SIZE_CLASS.sm}>
          <DialogHeader>
            <DialogTitle>删除经验</DialogTitle>
            <DialogDescription>
              确定要删除这条经验吗？删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
              取消
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false) }}>
        <DialogContent className={cn('flex h-[min(86vh,720px)] flex-col gap-0 overflow-hidden p-0', DIALOG_SIZE_CLASS.lg)}>
          <DialogHeader className="border-b border-[var(--agenthub-border)] px-6 py-4">
            <DialogTitle>编辑经验资产</DialogTitle>
            <DialogDescription>修改可复用经验的内容与触发规则，保存后立即生效。</DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <ExperienceEditor
              item={selectedItem}
              agents={agents}
              onCancel={() => setEditOpen(false)}
              onSave={handleSaveEdit}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
