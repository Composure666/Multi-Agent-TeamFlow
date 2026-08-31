'use client'

import { Check, FileCode2, FileText, Grid2X2, History, MoreHorizontal, Search, SlidersHorizontal, Trash2, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import { ARTIFACT_TABS, filterArtifactGroups, getVisibleArtifactGroups, type ArtifactTabId } from '@/components/artifact-workspace-view'
import { HorizontalScrollControls } from '@/components/horizontal-scroll-controls'
import { DetailSection, HistoryRow, LibraryStat, Meta, SavedState } from '@/components/workbench-detail-primitives'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { deleteArtifact, fetchArtifact, fetchArtifacts, type ArtifactListItem } from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const ARTIFACT_GROUP_PAGE_SIZE = 12
const SCROLL_END_THRESHOLD_PX = 80

type ArtifactFeedback = { type: 'success' | 'error'; message: string } | null

export function artifactExportUrl(artifactId: string) {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/export`
}

export function buildArtifactReference(item: ArtifactListItem) {
  return `请参考产物「${item.title}」v${item.version}（artifactId: ${item.id}）。`
}
export function ArtifactWorkspace({ onOpenConversations }: { onOpenConversations: () => void }) {
  const artifactWorkspaceScrollRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<ArtifactListItem[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ArtifactTabId>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ArtifactFeedback>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [artifactDetailOpen, setArtifactDetailOpen] = useState(false)
  const [visibleArtifactCount, setVisibleArtifactCount] = useState(ARTIFACT_GROUP_PAGE_SIZE)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [pendingAction, setPendingAction] = useState<'delete' | null>(null)
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const openArtifactPreview = useAppStore((s) => s.openArtifactPreview)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)

  const showFeedback = useCallback((next: ArtifactFeedback) => {
    setFeedback(next)
    if (next?.type === 'success') window.setTimeout(() => setFeedback(null), 1800)
  }, [])

  const loadArtifacts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchArtifacts()
      setItems(list)
      setSelectedId((current) => current && list.some((item) => item.id === current) ? current : null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLoadError(message)
      showFeedback({ type: 'error', message: '产物加载失败，请重试。' })
    } finally {
      setLoading(false)
    }
  }, [showFeedback])

  useEffect(() => {
    void loadArtifacts()
  }, [loadArtifacts])

  const groups = useMemo(() => groupArtifactVersions(items), [items])
  const activeTab = ARTIFACT_TABS.find((item) => item.id === tab) ?? ARTIFACT_TABS[0]
  const filteredGroups = useMemo(() => filterArtifactGroups(groups, query, tab), [groups, query, tab])
  const visibleGroups = getVisibleArtifactGroups(filteredGroups, visibleArtifactCount)
  const hasMoreArtifacts = visibleArtifactCount < filteredGroups.length

  useEffect(() => {
    setVisibleArtifactCount(ARTIFACT_GROUP_PAGE_SIZE)
  }, [query, tab, filteredGroups.length])

  const selected = selectedId ? items.find((item) => item.id === selectedId) : undefined
  const previewOpen = Boolean(previewArtifactId)

  useEffect(() => {
    if (previewOpen || !hasMoreArtifacts) return

    const scrollContainer = artifactWorkspaceScrollRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const distanceToBottom = scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop
      if (distanceToBottom > SCROLL_END_THRESHOLD_PX) return

      setVisibleArtifactCount((count) => Math.min(count + ARTIFACT_GROUP_PAGE_SIZE, filteredGroups.length))
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [filteredGroups.length, hasMoreArtifacts, previewOpen])

  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportArtifactSource = (artifactId: string) => {
    setExportingId(artifactId)
    window.location.href = artifactExportUrl(artifactId)
    showFeedback({ type: 'success', message: '已开始导出产物。' })
    window.setTimeout(() => setExportingId(null), 800)
  }

  const deleteArtifactsByIds = async (ids: string[]) => {
    const targetIds = Array.from(new Set(ids))
    if (targetIds.length === 0 || pendingAction) return

    setPendingAction('delete')
    setDeletingIds(new Set(targetIds))
    try {
      const results = await Promise.allSettled(targetIds.map((id) => deleteArtifact(id)))
      const succeededIds = targetIds.filter((_, index) => results[index]?.status === 'fulfilled')
      const failedCount = targetIds.length - succeededIds.length
      const succeededSet = new Set(succeededIds)

      setItems((current) => {
        const next = current.filter((item) => !succeededSet.has(item.id))
        setSelectedId((currentSelectedId) => {
          if (!currentSelectedId || !succeededSet.has(currentSelectedId)) return currentSelectedId
          setArtifactDetailOpen(false)
          return null
        })
        return next
      })
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const id of succeededIds) next.delete(id)
        return next
      })

      if (failedCount > 0) showFeedback({ type: 'error', message: `已删除 ${succeededIds.length} 个，${failedCount} 个删除失败。` })
      else {
        showFeedback({ type: 'success', message: `已删除 ${succeededIds.length} 个产物。` })
        clearSelection()
      }
    } catch (err) {
      console.error('[ArtifactWorkspace] delete artifacts failed', err)
      showFeedback({ type: 'error', message: '删除产物失败，请稍后重试。' })
    } finally {
      setDeletingIds(new Set())
      setPendingAction(null)
    }
  }

  const openPreview = async (id: string) => {
    setSelectedId(id)
    setArtifactDetailOpen(true)
    try {
      const artifact = await fetchArtifact(id)
      upsertArtifact(artifact)
      openArtifactPreview(id)
    } catch (err) {
      console.error('[ArtifactWorkspace] open preview failed', err)
      showFeedback({ type: 'error', message: '打开预览失败，请稍后重试。' })
    }
  }

  const copyArtifactReference = async (item: ArtifactListItem) => {
    if (!navigator.clipboard?.writeText) {
      showFeedback({ type: 'error', message: '当前环境不支持剪贴板写入。' })
      return
    }

    try {
      await navigator.clipboard.writeText(buildArtifactReference(item))
      setCopiedArtifactId(item.id)
      showFeedback({ type: 'success', message: '已复制产物引用。' })
      window.setTimeout(() => setCopiedArtifactId(null), 1500)
    } catch (err) {
      console.error('[ArtifactWorkspace] copy reference failed', err)
      showFeedback({ type: 'error', message: '复制失败，请检查剪贴板权限。' })
    }
  }

  const showArtifactDetailPanel = artifactDetailOpen && Boolean(selected)
  const previewOnly = previewOpen && !showArtifactDetailPanel

  const confirmDelete = async () => {
    if (!deleteTargetIds) return
    await deleteArtifactsByIds(deleteTargetIds)
    setDeleteTargetIds(null)
  }

  return (
    <div
      ref={artifactWorkspaceScrollRef}
      className={cn(
        'agenthub-hide-scrollbar flex min-w-0 gap-4 bg-[var(--agenthub-surface-muted)] p-4 xl:p-5',
        previewOnly
          ? 'h-[calc(100vh-var(--agenthub-titlebar-height,0px))] items-stretch overflow-hidden'
          : 'h-full min-h-0 items-start overflow-y-auto',
      )}
    >
      {!previewOpen && (
        <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
          <div className="shrink-0 border-b border-slate-100 p-4 dark:border-white/10 xl:p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:truncate dark:text-slate-50">产物库</h1>
                <p className="mt-1 text-sm leading-5 text-slate-500 sm:truncate dark:text-slate-400">集中管理文档、原型、PPT、图片、项目和历史版本</p>
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {selectionMode ? (
                  <>
                    <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={selectedIds.size === 0 || pendingAction === 'delete'} onClick={() => setDeleteTargetIds(Array.from(selectedIds))}>
                      {pendingAction === 'delete' ? '删除中…' : `删除所选(${selectedIds.size})`}
                    </Button>
                    <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={pendingAction === 'delete'} onClick={clearSelection}>完成</Button>
                  </>
                ) : (
                  <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={() => setSelectionMode(true)}>批量管理</Button>
                )}
                <Button variant="outline" className="h-8 rounded-lg px-3 text-xs" disabled={!selected || exportingId === selected.id} onClick={() => selected && exportArtifactSource(selected.id)}>{selected && exportingId === selected.id ? '导出中…' : '导出源码'}</Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
                  className={cn('size-8 rounded-lg text-slate-500 dark:text-slate-400', viewMode === 'grid' && 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]')}
                  title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
                >
                  <Grid2X2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产物、版本或来源会话" className="h-9 w-full rounded-lg border-slate-200 bg-slate-50 pl-10 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring/20 dark:border-white/10 dark:bg-neutral-950/50 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>

            <HorizontalScrollControls className="mt-3" contentClassName="gap-2 pb-1" scrollAmount={220}>
              {ARTIFACT_TABS.map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition', tab === item.id ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-400 dark:hover:border-white/15 dark:hover:bg-neutral-800 dark:hover:text-slate-100')}>{item.label}</button>
              ))}
            </HorizontalScrollControls>

            {feedback && (
              <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300')}>
                {feedback.message}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LibraryStat label="产物组" value={String(filteredGroups.length)} />
              <LibraryStat label="总版本" value={String(items.length)} />
              <LibraryStat label="当前分类" value={activeTab.label} />
              <LibraryStat label="视图" value={viewMode === 'grid' ? '网格' : '列表'} />
            </div>
          </div>

          <div
            className={cn(
              'min-h-[320px] p-4 xl:p-5',
              viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3' : 'space-y-2',
            )}
          >
            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">加载中…</div>
            ) : loadError ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 px-6 py-12 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <div>产物加载失败</div>
                <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => void loadArtifacts()}>重试</Button>
              </div>
            ) : visibleGroups.map((group) => (
              <ArtifactCard
                key={group.rootId}
                item={group.latest}
                versions={group.versions.length}
                selected={artifactDetailOpen && selected?.id === group.latest.id}
                compact={viewMode === 'list'}
                selectable={selectionMode}
                checked={selectedIds.has(group.latest.id)}
                deleting={deletingIds.has(group.latest.id)}
                onToggleSelected={() => toggleSelected(group.latest.id)}
                onSelect={() => {
                  setSelectedId(group.latest.id)
                  setArtifactDetailOpen(true)
                }}
                onPreview={() => void openPreview(group.latest.id)}
                onOpenConversation={() => { setActiveConversation(group.latest.conversationId); onOpenConversations() }}
              />
            ))}
            {!loading && !loadError && filteredGroups.length > 0 && !hasMoreArtifacts && (
              <div className={cn('py-4 text-center text-xs text-slate-400 dark:text-slate-500', viewMode === 'grid' && 'col-span-full')}>已经到底了</div>
            )}
            {!loading && !loadError && filteredGroups.length === 0 && <div className={cn('rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400', viewMode === 'grid' && 'col-span-full')}>{items.length === 0 ? '暂无产物' : '暂无匹配产物'}</div>}
          </div>
        </section>
      )}
      {showArtifactDetailPanel && selected && (
        <ArtifactDetailPanel
          item={selected}
          previewOpen={previewOpen}
          copied={copiedArtifactId === selected?.id}
          exporting={Boolean(selected && exportingId === selected.id)}
          deleting={Boolean(selected && deletingIds.has(selected.id))}
          onPreview={(id) => void openPreview(id)}
          onCopyReference={(item) => void copyArtifactReference(item)}
          onExport={exportArtifactSource}
          onDelete={(id) => setDeleteTargetIds([id])}
          onOpenConversation={(id) => { setActiveConversation(id); onOpenConversations() }}
          onClose={() => {
            setSelectedId(null)
            setArtifactDetailOpen(false)
          }}
        />
      )}
      <ArtifactPreviewPanel fullHeight={previewOnly} />
      <Dialog open={Boolean(deleteTargetIds)} onOpenChange={(open) => { if (!open && pendingAction !== 'delete') setDeleteTargetIds(null) }}>
        <DialogContent className="max-w-md border border-slate-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <DialogHeader>
            <DialogTitle>确认删除产物</DialogTitle>
            <DialogDescription>确认删除 {deleteTargetIds?.length ?? 0} 个产物？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetIds(null)} disabled={pendingAction === 'delete'}>取消</Button>
            <Button onClick={() => void confirmDelete()} disabled={pendingAction === 'delete'} className="bg-red-600 text-white hover:bg-red-700">{pendingAction === 'delete' ? '删除中…' : '确认删除'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ArtifactCard({
  item,
  versions,
  selected,
  compact,
  selectable,
  checked,
  deleting,
  onToggleSelected,
  onSelect,
  onPreview,
  onOpenConversation,
}: {
  item: ArtifactListItem
  versions: number
  selected: boolean
  compact: boolean
  selectable: boolean
  checked: boolean
  deleting: boolean
  onToggleSelected: () => void
  onSelect: () => void
  onPreview: () => void
  onOpenConversation: () => void
}) {
  const selector = selectable ? (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation()
        onToggleSelected()
      }}
      className={cn(
        'absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-md border text-xs shadow-sm transition',
        checked ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent)] text-white' : 'border-slate-200 bg-white text-transparent hover:border-slate-300 dark:border-white/10 dark:bg-neutral-900',
      )}
    >
      <Check className="size-3.5" />
    </button>
  ) : null

  if (compact) {
    return (
      <article
        className={cn(
          'relative grid grid-cols-[44px_minmax(0,1.5fr)_minmax(150px,0.9fr)_120px_232px] items-center gap-4 rounded-lg border bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70',
          selected ? 'border-[var(--agenthub-accent-border)] before:absolute before:left-0 before:top-2 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
          selectable && 'pl-10',
          deleting && 'pointer-events-none opacity-60',
        )}
      >
        {selector}
        <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300"><FileText className="size-4" /></div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
          <div className="truncate">{item.conversationTitle ?? '未命名会话'}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{item.createdByAgentId ?? 'Agent'}</div>
        </div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{formatTime(item.createdAt)}</div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={onSelect}>详情</Button>
          <Button size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={onPreview}>预览</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={onOpenConversation}>打开会话</Button>
        </div>
      </article>
    )
  }

  return (
    <article
      className={cn(
        'relative flex min-h-[236px] flex-col rounded-lg border bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:bg-neutral-800/70',
        selected ? 'border-[var(--agenthub-accent-border)] before:absolute before:left-0 before:top-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[var(--agenthub-accent)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200 dark:border-white/10',
        selectable && 'pt-10',
        deleting && 'pointer-events-none opacity-60',
      )}
    >
      {selector}
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-300"><FileText className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{item.title}</h3>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">v{item.version} · {item.type} · {versions} 个版本</div>
        </div>
        <MoreHorizontal className="size-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </div>

      <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">来源对话</span><span className="truncate">{item.conversationTitle ?? '未命名会话'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">创建者</span><span className="truncate font-mono text-[11px]">{item.createdByAgentId ?? 'Agent'}</span></div>
        <div className="flex min-w-0 gap-2"><span className="shrink-0 text-slate-400 dark:text-slate-500">更新时间</span><span className="truncate">{formatTime(item.createdAt)}</span></div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={onSelect}>详情</Button>
        <Button size="sm" className="h-8 rounded-lg text-xs" onClick={onPreview}>预览</Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={onOpenConversation}>打开会话</Button>
      </div>
    </article>
  )
}

function ArtifactDetailPanel({
  item,
  previewOpen,
  copied,
  exporting,
  deleting,
  onPreview,
  onCopyReference,
  onExport,
  onDelete,
  onOpenConversation,
  onClose,
}: {
  item?: ArtifactListItem
  previewOpen: boolean
  copied: boolean
  exporting: boolean
  deleting: boolean
  onPreview: (id: string) => void
  onCopyReference: (item: ArtifactListItem) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
  onOpenConversation: (conversationId: string) => void
  onClose: () => void
}) {
  return (
    <aside className={cn('hidden shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900 xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block', previewOpen ? 'w-[360px] 2xl:w-[380px]' : 'w-[360px]')}>
      {item ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-800 dark:text-slate-300 dark:ring-white/10">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">{item.title}</h2>
                  <span className="rounded-md border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--agenthub-accent)]">产物</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.conversationTitle ?? '未命名会话'}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
                title="关闭详情"
                aria-label="关闭详情"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-slate-300">{item.type}</span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">v{item.version}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-slate-300">可预览</span>
            </div>
          </div>
          <div className="space-y-3 p-4 text-sm">
              <DetailSection icon={<SlidersHorizontal className="size-4" />} title="元数据" aside={<SavedState />}>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Meta label="创建者" value={item.createdByAgentId ?? 'Agent'} />
                  <Meta label="来源会话" value={item.conversationTitle ?? '未命名'} />
                  <Meta label="创建时间" value={formatTime(item.createdAt)} />
                  <Meta label="更新时间" value={formatTime(item.createdAt)} />
                </div>
              </DetailSection>

              <DetailSection icon={<Wrench className="size-4" />} title="快捷操作">
                <div className="grid gap-2">
                  <Button onClick={() => onPreview(item.id)} className="rounded-lg">打开预览</Button>
                  <Button variant="outline" className="rounded-lg" onClick={() => onCopyReference(item)}>{copied ? '已复制' : '复制引用'}</Button>
                  <Button variant="outline" className="rounded-lg" disabled={exporting} onClick={() => onExport(item.id)}>{exporting ? '导出中…' : '导出源码'}</Button>
                  <Button variant="outline" className="rounded-lg" onClick={() => onOpenConversation(item.conversationId)}>打开会话</Button>
                  <Button variant="outline" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10" disabled={deleting} onClick={() => onDelete(item.id)}>
                    <Trash2 className="mr-2 size-4" />
                    {deleting ? '删除中…' : '删除产物'}
                  </Button>
                </div>
              </DetailSection>

              <DetailSection icon={<History className="size-4" />} title="版本历史">
                <HistoryRow icon={<FileCode2 className="size-4" />} title={`当前版本 v${item.version}`} description="已按 parentArtifactId 聚合版本；详情历史列表可继续扩展。" time="已接入" />
              </DetailSection>

              <DetailSection icon={<FileText className="size-4" />} title="产物标识">
                <div className="truncate rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-500 dark:border-white/10 dark:bg-neutral-950/50 dark:text-slate-400">{item.id}</div>
              </DetailSection>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500 dark:text-slate-400">选择一个产物查看详情</div>
      )}
    </aside>
  )
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
