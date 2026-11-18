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
  Filter,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/experience/stat-card'
import { ExperienceCard } from '@/components/experience/experience-card'
import { ExperienceSidebar } from '@/components/experience/experience-sidebar'
import { ExperienceDetail } from '@/components/experience/experience-detail'
import { ExperienceEditor } from '@/components/experience/experience-editor'
import { ExperienceCreateDialog } from '@/components/experience/experience-create-dialog'
import { EmptyState, PageHeader, PageShell } from '@/components/workbench-primitives'
import { DIALOG_SIZE_CLASS } from '@/components/dialog-sizes'
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这条经验吗？删除后无法恢复。')) return
    try {
      await deleteExperience(id)
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch (err) {
      console.error('[ExperienceLibrary] delete failed', err)
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

          {/* 统计卡片 */}
          <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[var(--agenthub-border)] px-4 py-4 lg:px-6 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={Layers} label="全部" value={stats.total} trend={calcTrend(stats.weeklyNew)} iconBg="bg-[var(--agenthub-accent-soft)]" iconColor="text-[var(--agenthub-accent)]" />
            <StatCard icon={CheckCircle2} label="已启用" value={stats.active} trend={calcTrend(stats.weeklyNew)} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" />
            <StatCard icon={FileText} label="草稿" value={stats.drafts} iconBg="bg-slate-500/10" iconColor="text-slate-500" />
            <StatCard icon={Snowflake} label="冷资产" value={stats.cold} iconBg="bg-amber-500/10" iconColor="text-amber-500" />
            <StatCard icon={TrendingUp} label="累计使用" value={`${stats.totalUsage} 次`} trend={calcTrend(stats.weeklyUsage)} sparkline={stats.weeklyUsage} iconBg="bg-purple-500/10" iconColor="text-purple-500" />
          </div>

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
            <div className="flex items-center gap-1">
              {(['all', 'experience', 'reflection', 'profile_fact'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={kindFilter === kind ? 'secondary' : 'ghost'}
                  className="h-8 text-xs"
                  onClick={() => setKindFilter(kind)}
                >
                  {kind === 'all' ? '全部' : KIND_LABEL[kind]}
                </Button>
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
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              新建经验
            </Button>
          </div>

          {/* Scope Tab */}
          <div className="shrink-0 border-b border-[var(--agenthub-border)] px-4 lg:px-6">
            <Tabs value={scopeTab} onValueChange={(v) => setScopeTab(v as typeof scopeTab)}>
              <TabsList className="h-9 gap-1 bg-transparent">
                <TabsTrigger value="all" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--agenthub-accent)] rounded-none px-3 text-xs">
                  全部 ({items.length})
                </TabsTrigger>
                <TabsTrigger value="agent" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--agenthub-accent)] rounded-none px-3 text-xs">
                  按 Agent ({items.filter((i) => i.scope === 'agent').length})
                </TabsTrigger>
                <TabsTrigger value="global" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--agenthub-accent)] rounded-none px-3 text-xs">
                  全局 ({items.filter((i) => i.scope === 'global').length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
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

        {/* 右侧边栏 */}
        <ExperienceSidebar items={items} onOpen={handleOpen} />
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
