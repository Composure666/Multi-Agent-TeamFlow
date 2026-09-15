'use client'

import {
  Check,
  Eye,
  FileCode2,
  FileText,
  FolderGit,
  GitCompare,
  Globe,
  Grid2X2,
  History,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  Network,
  Presentation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { ArtifactVersionGroup } from '@/lib/artifact-groups'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AgentAvatar } from '@/components/agent-avatar'
import { ArtifactPreviewPanel } from '@/components/artifact-preview-panel'
import {
  ARTIFACT_TABS,
  filterArtifactGroups,
  getVisibleArtifactGroups,
  groupArtifactsByConversation,
  type ArtifactTabId,
} from '@/components/artifact-workspace-view'
import { DetailSection, HistoryRow, Meta, SavedState } from '@/components/workbench-detail-primitives'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deleteArtifact, fetchArtifact, fetchArtifacts, type ArtifactListItem } from '@/lib/api'
import { groupArtifactVersions } from '@/lib/artifact-groups'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const ARTIFACT_GROUP_PAGE_SIZE = 12
const SCROLL_END_THRESHOLD_PX = 80
const RECENT_STRIP_COUNT = 5

type ArtifactFeedback = { type: 'success' | 'error'; message: string } | null

export function artifactExportUrl(artifactId: string) {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/export`
}

export function buildArtifactReference(item: ArtifactListItem) {
  return `请参考产物「${item.title}」v${item.version}（artifactId: ${item.id}）。`
}

// Per-type visual treatment: cover gradient, watermark icon, chip color, label, content-tag tint.
const TYPE_THUMB: Record<string, {
  Icon: typeof FileText
  cover: string
  ink: string
  label: string
  chip: string
  tag: string
  shape: 'lines' | 'browser' | 'slides' | 'image' | 'tree' | 'code' | 'diff' | 'nodes'
}> = {
  document: {
    Icon: FileText,
    cover: 'bg-gradient-to-br from-sky-200/80 via-sky-50/80 to-white dark:from-sky-500/25 dark:via-sky-500/8 dark:to-neutral-900/40',
    ink: 'text-sky-600 dark:text-sky-300',
    label: '文档',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    tag: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    shape: 'lines',
  },
  web_app: {
    Icon: Globe,
    cover: 'bg-gradient-to-br from-emerald-200/80 via-emerald-50/80 to-white dark:from-emerald-500/25 dark:via-emerald-500/8 dark:to-neutral-900/40',
    ink: 'text-emerald-600 dark:text-emerald-300',
    label: 'Web',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    tag: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    shape: 'browser',
  },
  ppt: {
    Icon: Presentation,
    cover: 'bg-gradient-to-br from-orange-200/80 via-orange-50/80 to-white dark:from-orange-500/25 dark:via-orange-500/8 dark:to-neutral-900/40',
    ink: 'text-orange-600 dark:text-orange-300',
    label: 'PPT',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    tag: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
    shape: 'slides',
  },
  image: {
    Icon: ImageIcon,
    cover: 'bg-gradient-to-br from-rose-200/80 via-rose-50/80 to-white dark:from-rose-500/25 dark:via-rose-500/8 dark:to-neutral-900/40',
    ink: 'text-rose-600 dark:text-rose-300',
    label: '图片',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    tag: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    shape: 'image',
  },
  project: {
    Icon: FolderGit,
    cover: 'bg-gradient-to-br from-teal-200/80 via-teal-50/80 to-white dark:from-teal-500/25 dark:via-teal-500/8 dark:to-neutral-900/40',
    ink: 'text-teal-600 dark:text-teal-300',
    label: '项目',
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    tag: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
    shape: 'tree',
  },
  code_file: {
    Icon: FileCode2,
    cover: 'bg-gradient-to-br from-slate-300/80 via-slate-100/80 to-white dark:from-slate-500/30 dark:via-slate-500/10 dark:to-neutral-900/40',
    ink: 'text-indigo-600 dark:text-indigo-300',
    label: '代码',
    chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    tag: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    shape: 'code',
  },
  diff: {
    Icon: GitCompare,
    cover: 'bg-gradient-to-br from-amber-200/80 via-amber-50/80 to-white dark:from-amber-500/25 dark:via-amber-500/8 dark:to-neutral-900/40',
    ink: 'text-amber-600 dark:text-amber-300',
    label: 'Diff',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    tag: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    shape: 'diff',
  },
  diagram: {
    Icon: Network,
    cover: 'bg-gradient-to-br from-violet-200/80 via-violet-50/80 to-white dark:from-violet-500/25 dark:via-violet-500/8 dark:to-neutral-900/40',
    ink: 'text-violet-600 dark:text-violet-300',
    label: '图表',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    tag: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    shape: 'nodes',
  },
}

function thumbFor(type: string) {
  return TYPE_THUMB[type] ?? {
    Icon: FileText,
    cover: 'bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-500/20 dark:to-neutral-900/40',
    ink: 'text-slate-500',
    label: type,
    chip: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
    tag: 'bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300',
    shape: 'lines' as const,
  }
}

// Extract 1-2 short "content" tokens from a title to enrich the chip row.
function extractContentTags(title: string): string[] {
  const t = title.trim()
  if (!t) return []
  const tags: string[] = []
  const cjk = t.match(/[\u4e00-\u9fa5]{2,5}/g) ?? []
  for (const m of cjk) {
    tags.push(m)
    if (tags.length >= 2) return tags
  }
  if (tags.length === 0) {
    const alpha = t.split(/[\s\-_/]+/).filter((w) => w.length > 0)
    for (const w of alpha) {
      tags.push(w.slice(0, 8))
      if (tags.length >= 2) return tags
    }
  }
  return tags
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
  const [groupByConversation, setGroupByConversation] = useState(false)
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [pendingAction, setPendingAction] = useState<'delete' | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const openArtifactPreview = useAppStore((s) => s.openArtifactPreview)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const agents = useAppStore((s) => s.agents)

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
      setSelectedId((current) => (current && list.some((item) => item.id === current) ? current : null))
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
  const filteredGroups = useMemo(() => filterArtifactGroups(groups, query, tab), [groups, query, tab])
  const visibleGroups = getVisibleArtifactGroups(filteredGroups, visibleArtifactCount)

  const conversationGroups = useMemo(
    () => (groupByConversation ? groupArtifactsByConversation(visibleGroups) : []),
    [groupByConversation, visibleGroups],
  )

  const renderArtifactCard = (group: ArtifactVersionGroup<ArtifactListItem>) => (
    <ArtifactCard
      key={group.rootId}
      item={group.latest}
      versions={group.versions.length}
      selected={artifactDetailOpen && selected?.id === group.latest.id}
      compact={viewMode === 'list'}
      selectable={selectionMode}
      checked={selectedIds.has(group.latest.id)}
      isFavorite={favorites.has(group.latest.id)}
      deleting={deletingIds.has(group.latest.id)}
      agentName={resolveAgentName(agents, group.latest.createdByAgentId)}
      agentObj={resolveAgentObj(agents, group.latest.createdByAgentId)}
      onToggleSelected={() => toggleSelected(group.latest.id)}
      onSelect={() => { setSelectedId(group.latest.id); setArtifactDetailOpen(true) }}
      onPreview={() => void openPreview(group.latest.id)}
      onOpenConversation={() => { setActiveConversation(group.latest.conversationId); onOpenConversations() }}
      onCopyReference={() => void copyArtifactReference(group.latest)}
      onExport={() => exportArtifactSource(group.latest.id)}
      onDelete={() => setDeleteTargetIds([group.latest.id])}
      onToggleFavorite={() => toggleFavorite(group.latest.id)}
    />
  )
  const hasMoreArtifacts = visibleArtifactCount < filteredGroups.length

  // Per-tab counts (unfiltered, for the segmented tabs)
  const tabCounts = useMemo(() => {
    const counts: Record<ArtifactTabId, number> = { all: 0, document: 0, web_app: 0, ppt: 0, image: 0, project: 0, code: 0 }
    for (const g of groups) {
      counts.all += 1
      const t = g.latest.type
      if (t === 'document') counts.document += 1
      else if (t === 'web_app') counts.web_app += 1
      else if (t === 'ppt') counts.ppt += 1
      else if (t === 'image') counts.image += 1
      else if (t === 'project') counts.project += 1
      else if (t === 'code_file' || t === 'diff') counts.code += 1
    }
    return counts
  }, [groups])

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

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportArtifactSource = (artifactId: string) => {
    setExportingId(artifactId)
    window.open(artifactExportUrl(artifactId), '_blank', 'noopener,noreferrer')
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
    setArtifactDetailOpen(false)
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

  const recentGroups = groups.slice(0, RECENT_STRIP_COUNT)

  return (
    <div
      ref={artifactWorkspaceScrollRef}
      className={cn(
        'agenthub-hide-scrollbar flex min-w-0 gap-4 bg-[var(--agenthub-surface-muted)] p-4 xl:p-5',
        previewOnly
          ? 'h-full items-stretch overflow-hidden'
          : 'h-full min-h-0 items-start overflow-y-auto',
      )}
    >
      {!previewOpen && (
        <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900">
          {/* Header row: title + search + actions */}
          <div className="shrink-0 border-b border-slate-100 p-4 dark:border-white/10 xl:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:truncate dark:text-slate-50">产物库</h1>
                <p className="mt-1 text-sm leading-5 text-slate-500 sm:truncate dark:text-slate-400">
                  集中管理文档、原型、PPT、图片、项目和历史版本
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索产物、版本或来源会话"
                    className="h-8 w-full rounded-lg pl-8 text-sm"
                  />
                </div>
                {selectionMode ? (
                  <>
                    <Button variant="outline" size="sm" disabled={selectedIds.size === 0 || pendingAction === 'delete'} onClick={() => setDeleteTargetIds(Array.from(selectedIds))}>
                      {pendingAction === 'delete' ? '删除中…' : `删除所选(${selectedIds.size})`}
                    </Button>
                    <Button variant="outline" size="sm" disabled={pendingAction === 'delete'} onClick={clearSelection}>完成</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>批量管理</Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupByConversation((value) => !value)}
                  className={cn('gap-1.5', groupByConversation && 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]')}
                  title={groupByConversation ? '取消按会话分组' : '按会话分组'}
                >
                  <Layers className="size-3.5" />
                  按会话
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
                  className={cn(viewMode === 'grid' && 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]')}
                  title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
                >
                  <Grid2X2 className="size-4" />
                </Button>
              </div>
            </div>

            {/* Segmented tab pills with counts */}
            <div className="mt-4 -mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-1.5">
                {ARTIFACT_TABS.map((item) => {
                  const active = tab === item.id
                  const count = tabCounts[item.id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition',
                        active
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/5',
                      )}
                    >
                      {item.label}
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-white/15 dark:bg-black/15' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400')}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {feedback && (
              <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300')}>
                {feedback.message}
              </div>
            )}
          </div>

          <div className="min-h-[320px] space-y-4 p-4 xl:p-5">
            {/* Recent access strip */}
            {!loading && !loadError && recentGroups.length >= 3 && (
              <RecentStrip
                groups={recentGroups}
                onSelect={(id) => { setSelectedId(id); setArtifactDetailOpen(true) }}
                onPreview={(id) => void openPreview(id)}
              />
            )}

            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">加载中…</div>
            ) : loadError ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 px-6 py-12 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <div>产物加载失败</div>
                <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => void loadArtifacts()}>重试</Button>
              </div>
            ) : groupByConversation ? (
              <div className="space-y-6">
                {conversationGroups.map((conversation) => (
                  <div key={conversation.conversationId} className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Layers className="size-3.5 shrink-0 text-slate-400" />
                        <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {conversation.conversationTitle}
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-500 dark:bg-white/5 dark:text-slate-400">
                          {conversation.groups.length}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => { setActiveConversation(conversation.conversationId); onOpenConversations() }}
                      >
                        打开会话
                      </Button>
                    </div>
                    <div
                      className={cn(
                        viewMode === 'grid'
                          ? 'grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3'
                          : 'space-y-2',
                      )}
                    >
                      {conversation.groups.map((group) => renderArtifactCard(group))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  viewMode === 'grid'
                    ? 'grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3'
                    : 'space-y-2',
                )}
              >
                {visibleGroups.map((group) => renderArtifactCard(group))}
              </div>
            )}

            {!loading && !loadError && filteredGroups.length > 0 && !hasMoreArtifacts && (
              <div className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">已经到底了</div>
            )}
            {!loading && !loadError && filteredGroups.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-neutral-950/40 dark:text-slate-400">
                {items.length === 0 ? '暂无产物' : '暂无匹配产物'}
              </div>
            )}
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
      <ArtifactPreviewPanel fullHeight={previewOpen} />
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

// ─── Recent access strip ──────────────────────────────────────────────
function RecentStrip({
  groups,
  onSelect,
  onPreview,
}: {
  groups: ReturnType<typeof groupArtifactVersions<ArtifactListItem>>
  onSelect: (id: string) => void
  onPreview: (id: string) => void
}) {
  return (
    <div className="rounded-xl bg-slate-50/70 px-3 py-2.5 dark:bg-white/[0.02]">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Sparkles className="size-3.5 text-amber-500" />
        最近访问
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => {
          const t = thumbFor(g.latest.type)
          return (
            <div
              key={g.rootId}
              className="group/recent relative flex w-44 shrink-0 items-center gap-2 rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/15"
            >
              <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', t.chip)}>
                <t.Icon className={cn('size-3.5', t.ink)} />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(g.latest.id)}
                  className="block w-full truncate text-left text-xs font-medium text-slate-800 hover:text-[var(--agenthub-accent)] dark:text-slate-200"
                >
                  {g.latest.title}
                </button>
                <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                  {formatRelativeTime(g.latest.createdAt)} · {t.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onPreview(g.latest.id)}
                className="absolute inset-0 z-0 rounded-lg"
                aria-label="预览"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────
function ArtifactCard({
  item,
  versions,
  selected,
  compact,
  selectable,
  checked,
  isFavorite,
  deleting,
  agentName,
  agentObj,
  onToggleSelected,
  onSelect,
  onPreview,
  onOpenConversation,
  onCopyReference,
  onExport,
  onDelete,
  onToggleFavorite,
}: {
  item: ArtifactListItem
  versions: number
  selected: boolean
  compact: boolean
  selectable: boolean
  checked: boolean
  isFavorite: boolean
  deleting: boolean
  agentName: string
  agentObj: { id: string; name: string }
  onToggleSelected: () => void
  onSelect: () => void
  onPreview: () => void
  onOpenConversation: () => void
  onCopyReference: () => void
  onExport: () => void
  onDelete: () => void
  onToggleFavorite: () => void
}) {
  const t = thumbFor(item.type)
  const contentTags = useMemo(() => extractContentTags(item.title), [item.title])
  const subtitle = describeArtifact(item, t.label, versions)

  if (compact) {
    return (
      <article
        className={cn(
          'group relative grid grid-cols-[96px_minmax(0,1fr)_auto] items-stretch gap-3 overflow-hidden rounded-lg border bg-white shadow-[0_4px_20px_rgb(15_23_42/0.06)] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-slate-300/80 hover:shadow-[0_10px_40px_rgb(15_23_42/0.08)] dark:bg-neutral-900 dark:hover:border-white/15 dark:hover:shadow-[0_10px_40px_rgb(0_0_0/0.5)]',
          selected ? 'border-[var(--agenthub-accent-border)] dark:border-[var(--agenthub-accent-border)]' : 'border-slate-200/80 dark:border-white/10',
          deleting && 'pointer-events-none opacity-60',
        )}
      >
        <div className={cn('relative h-full min-h-[80px] overflow-hidden', t.cover)}>
          <div className="absolute inset-0 transition-transform duration-200 group-hover:scale-[1.02]">
            <CoverShape shape={t.shape} title={item.title} compact imageUrl={item.imageUrl} pptCover={item.pptCover} />
          </div>
        </div>
        <div className="min-w-0 py-2">
          <button type="button" onClick={onSelect} className="min-w-0 block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-[var(--agenthub-accent)] dark:text-slate-50">
            {item.title}
          </button>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', t.chip)}>{t.label}</span>
            {contentTags.map((tag) => (
              <span key={tag} className={cn('rounded-full px-1.5 py-0.5 text-[10px]', t.tag)}>
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <AgentAvatar agent={agentObj} size="xs" />
            <span className="truncate">{agentName}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
            <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">v{item.version}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 pr-2">
          {selectable ? (
            <button
              type="button"
              aria-pressed={checked}
              onClick={onToggleSelected}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border text-xs transition',
                checked ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent)] text-white' : 'border-slate-200 bg-white text-transparent hover:border-slate-300 dark:border-white/10 dark:bg-neutral-900',
              )}
            >
              <Check className="size-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleFavorite}
                className="flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:text-amber-500"
                title={isFavorite ? '取消收藏' : '收藏'}
              >
                <Star className={cn('size-3.5', isFavorite && 'fill-amber-400 text-amber-400')} />
              </button>
              <button
                type="button"
                onClick={onPreview}
                className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                title="预览"
              >
                <Eye className="size-3.5" />
              </button>
              <ArtifactMoreMenu onOpenConversation={onOpenConversation} onCopyReference={onCopyReference} onExport={onExport} onDelete={onDelete} />
            </>
          )}
        </div>
      </article>
    )
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-[0_4px_20px_rgb(15_23_42/0.06)] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-slate-300/80 hover:shadow-[0_10px_40px_rgb(15_23_42/0.08)] dark:bg-neutral-900 dark:hover:border-white/20 dark:hover:shadow-[0_10px_40px_rgb(0_0_0/0.5)]',
        selected ? 'border-[var(--agenthub-accent-border)]' : 'border-slate-200/80 dark:border-white/10',
        deleting && 'pointer-events-none opacity-60',
      )}
    >
      {/* Type-specific cover — authentic first-page preview */}
      <div className={cn('relative h-44 w-full overflow-hidden', t.cover)}>
        <div className="absolute inset-0 transition-transform duration-200 group-hover:scale-[1.02]">
          <CoverShape shape={t.shape} title={item.title} imageUrl={item.imageUrl} pptCover={item.pptCover} />
        </div>

        {/* Type badge (top-left) */}
        <span className={cn('absolute left-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm', t.chip)}>
          <t.Icon className="size-3" />
          {t.label}
        </span>

        {/* Selection checkbox (top-left when in selection mode) */}
        {selectable && (
          <button
            type="button"
            aria-pressed={checked}
            onClick={(e) => { e.stopPropagation(); onToggleSelected() }}
            className={cn(
              'absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-md border text-xs shadow-sm transition',
              checked ? 'border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent)] text-white' : 'border-white/80 bg-white/90 text-transparent hover:border-slate-300 dark:border-white/20 dark:bg-neutral-900/80',
            )}
          >
            <Check className="size-3.5" />
          </button>
        )}

        {/* Preview pill (bottom-right, hover-revealed) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPreview() }}
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-white dark:bg-neutral-900/85 dark:text-slate-200 dark:hover:bg-neutral-900"
        >
          <Eye className="size-3" />
          预览
        </button>
      </div>

      {/* Body — four info layers with breathing room: title / subtitle / tags / footer */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <button type="button" onClick={onSelect} className="min-w-0 text-left">
          <h3 className="line-clamp-1 text-lg font-semibold leading-tight text-slate-950 hover:text-[var(--agenthub-accent)] dark:text-slate-50">
            {item.title}
          </h3>
          {item.description && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-600 dark:text-slate-300">
              {item.description}
            </p>
          )}
          <p className="mt-1.5 line-clamp-1 text-[12px] leading-4 text-slate-400 dark:text-slate-500">
            {subtitle}
          </p>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', t.chip)}>{t.label}</span>
          {contentTags.map((tag) => (
            <span key={tag} className={cn('rounded-full px-1.5 py-0.5 text-[10px]', t.tag)}>
              {tag}
            </span>
          ))}
        </div>

        {/* Footer bar — GitHub/Notion style: avatar · name · time · version · star · more */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-white/5 dark:text-slate-400">
          <AgentAvatar agent={agentObj} size="xs" />
          <span className="truncate">{agentName}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">v{item.version}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              className={cn(
                'flex size-6 items-center justify-center rounded transition',
                isFavorite ? 'text-amber-500' : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:text-amber-500',
              )}
              title={isFavorite ? '取消收藏' : '收藏'}
            >
              <Star className={cn('size-3.5', isFavorite && 'fill-amber-400 text-amber-400')} />
            </button>
            <ArtifactMoreMenu onOpenConversation={onOpenConversation} onCopyReference={onCopyReference} onExport={onExport} onDelete={onDelete} />
          </span>
        </div>
      </div>
    </article>
  )
}

// ─── Type-specific "first page" preview inside the cover ────────
// Each type renders a sheet that mimics a real thumbnail, using the
// artifact's actual title for a more authentic preview.
function CoverShape({ shape, title = '', compact = false, imageUrl, pptCover }: { shape: 'lines' | 'browser' | 'slides' | 'image' | 'tree' | 'code' | 'diff' | 'nodes'; title?: string; compact?: boolean; imageUrl?: string; pptCover?: { title?: string; subtitle?: string; bullets?: string[]; primaryColor?: string; bgColor?: string } }) {
  const inset = compact ? 'inset-x-2 top-1.5 bottom-1.5' : 'inset-x-4 top-3 bottom-3'
  const line = 'rounded bg-slate-200 dark:bg-white/10'
  const shortTitle = title.length > 16 ? title.slice(0, 14) + '…' : title
  const page = (children: ReactNode, className?: string) => (
    <div
      className={cn(
        `absolute ${inset} overflow-hidden rounded-lg bg-white shadow-[0_1px_4px_rgb(15_23_42/0.10)] dark:bg-neutral-800`,
        className,
      )}
    >
      {children}
    </div>
  )

  if (shape === 'browser') {
    return page(
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5 dark:border-white/10">
          <span className="size-1.5 rounded-full bg-rose-400" />
          <span className="size-1.5 rounded-full bg-amber-400" />
          <span className="size-1.5 rounded-full bg-emerald-400" />
          <div className="ml-1 h-2 flex-1 rounded-sm bg-slate-100 dark:bg-white/10" />
        </div>
        <div className="flex-1 px-3 pt-2.5">
          {shortTitle && <div className="h-2.5 w-3/4 rounded bg-slate-700/70 dark:bg-slate-300/70" />}
          <div className="mt-1.5 h-1.5 w-1/2 rounded bg-emerald-300 dark:bg-emerald-500/40" />
          <div className="mt-2 space-y-1">
            <div className={`h-1 w-full ${line}`} />
            <div className={`h-1 w-5/6 ${line}`} />
            <div className={`h-1 w-2/3 ${line}`} />
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <div className={`h-4 flex-1 rounded ${line}`} />
            <div className={`h-4 flex-1 rounded ${line}`} />
            <div className={`h-4 flex-1 rounded ${line}`} />
          </div>
        </div>
      </div>,
      'ring-1 ring-slate-200/70 dark:ring-white/10',
    )
  }

  if (shape === 'slides') {
    const primary = pptCover?.primaryColor ? `#${pptCover.primaryColor}` : undefined
    const bg = pptCover?.bgColor ? `#${pptCover.bgColor}` : undefined
    const slideTitle = pptCover?.title || shortTitle
    const slideSubtitle = pptCover?.subtitle
    const slideBullets = pptCover?.bullets ?? []
    return page(
      <div className="relative flex h-full flex-col overflow-hidden" style={bg ? { background: bg } : undefined}>
        <div
          className="shrink-0 px-3 pb-2.5 pt-3"
          style={{ background: primary ?? 'linear-gradient(to bottom right, #f97316, #fb923c, #fbbf24)' }}
        >
          {slideTitle ? (
            <div className="line-clamp-2 text-[11px] font-bold leading-tight text-white drop-shadow-sm">{slideTitle}</div>
          ) : (
            <div className="h-2.5 w-2/3 rounded bg-white/85" />
          )}
          {slideSubtitle ? (
            <div className="mt-1 line-clamp-1 text-[8px] text-white/80">{slideSubtitle}</div>
          ) : (
            <div className="mt-1 h-1 w-1/3 rounded bg-white/50" />
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1.5 px-3 py-2">
          {slideBullets.length > 0 ? (
            slideBullets.map((b, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span
                  className="mt-0.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: primary ?? '#fb923c' }}
                />
                <span className="line-clamp-1 text-[8px] text-slate-600 dark:text-slate-300">{b}</span>
              </div>
            ))
          ) : (
            <>
              <div className="flex items-end gap-1">
                <div className="h-5 w-2 rounded-t" style={{ background: primary ? `${primary}40` : '#fed7aa' }} />
                <div className="h-8 w-2 rounded-t" style={{ background: primary ? `${primary}60` : '#fdba74' }} />
                <div className="h-6 w-2 rounded-t" style={{ background: primary ? `${primary}40` : '#fed7aa' }} />
                <div className="h-10 w-2 rounded-t" style={{ background: primary ?? '#fb923c' }} />
              </div>
              <div className={`h-1 w-full ${line}`} />
              <div className={`h-1 w-4/5 ${line}`} />
            </>
          )}
        </div>
      </div>,
    )
  }

  if (shape === 'image') {
    if (imageUrl) {
      return (
        <div className={`absolute ${inset} overflow-hidden rounded-lg bg-slate-100 dark:bg-neutral-800`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title || 'image'}
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
      )
    }
    return (
      <div className={`absolute ${inset} overflow-hidden rounded-lg bg-gradient-to-br from-sky-300 via-emerald-200 to-amber-200 shadow-[0_1px_4px_rgb(15_23_42/0.10)] dark:from-sky-500/40 dark:via-emerald-500/25 dark:to-amber-500/20`}>
        <div className="absolute right-3 top-2.5 size-6 rounded-full bg-white/70 dark:bg-white/30" />
        <div className="absolute bottom-0 left-0 right-0 h-6 rounded-t-[50%] bg-emerald-400/60 dark:bg-emerald-600/40" />
        <div className="absolute bottom-0 left-1/4 h-4 w-1/2 rounded-t-[60%] bg-emerald-500/50 dark:bg-emerald-700/40" />
        {!compact && shortTitle && (
          <span className="absolute bottom-1.5 left-2 max-w-[70%] truncate rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            {shortTitle}
          </span>
        )}
      </div>
    )
  }

  if (shape === 'tree') {
    return page(
      <div className="px-3 pt-2.5 font-mono text-[9px] leading-[17px] text-slate-500 dark:text-slate-400">
        <div className="font-semibold text-slate-700 dark:text-slate-300">▸ {shortTitle || 'src/'}</div>
        <div className="pl-3">▸ components/</div>
        <div className="pl-6">▸ Button.tsx</div>
        <div className="pl-6">▸ Card.tsx</div>
        <div className="pl-3">▸ utils/</div>
        <div className="pl-3">▸ styles/</div>
        {!compact && <div>▸ package.json</div>}
      </div>,
    )
  }

  if (shape === 'code') {
    return page(
      <div className="h-full bg-neutral-900 px-2.5 pt-2 font-mono text-[9px] leading-[17px] dark:bg-black/70">
        <div className="flex items-center gap-1 pb-1.5">
          <span className="size-1 rounded-full bg-rose-400/80" />
          <span className="size-1 rounded-full bg-amber-400/80" />
          <span className="size-1 rounded-full bg-emerald-400/80" />
          <span className="ml-1.5 text-[8px] text-slate-500">{shortTitle || 'main.ts'}</span>
        </div>
        <div><span className="mr-1.5 text-slate-600">1</span><span className="text-violet-400">import</span><span className="text-slate-300"> {'{ useState }'} </span><span className="text-violet-400">from</span><span className="text-emerald-400"> &apos;react&apos;</span></div>
        <div><span className="mr-1.5 text-slate-600">2</span><span className="text-violet-400">const</span><span className="text-sky-300"> App</span><span className="text-slate-300"> = () ={'>'} </span><span className="text-violet-400">{'{'}</span></div>
        <div><span className="mr-1.5 text-slate-600">3</span><span className="text-slate-400">  </span><span className="text-violet-400">const</span><span className="text-slate-300"> [data, setData] = </span><span className="text-sky-300">useState</span><span className="text-slate-300">(</span><span className="text-amber-300">null</span><span className="text-slate-300">)</span></div>
        <div><span className="mr-1.5 text-slate-600">4</span><span className="text-slate-400">  </span><span className="text-violet-400">return</span><span className="text-slate-300"> </span><span className="text-emerald-400">{'<div/>'}</span></div>
        {!compact && <div><span className="mr-1.5 text-slate-600">5</span><span className="text-violet-400">{'}'}</span></div>}
      </div>,
      'bg-neutral-900 dark:bg-black/70',
    )
  }

  if (shape === 'diff') {
    return page(
      <div className="space-y-0.5 px-2 pt-2.5 font-mono text-[9px] leading-[17px]">
        <div className="rounded-r bg-emerald-500/10 px-1.5 text-emerald-600 dark:text-emerald-400">+ {shortTitle || 'export function App()'}</div>
        <div className="rounded-r bg-rose-500/10 px-1.5 text-rose-600 dark:text-rose-400">- export default Old</div>
        <div className="px-1.5 text-slate-400 dark:text-slate-500">  import {'{ x }'} from &apos;y&apos;</div>
        <div className="rounded-r bg-emerald-500/10 px-1.5 text-emerald-600 dark:text-emerald-400">+ return {'<App />'}</div>
        {!compact && <div className="px-1.5 text-slate-400 dark:text-slate-500">  console.log(&apos;ready&apos;)</div>}
      </div>,
    )
  }

  if (shape === 'nodes') {
    return page(
      <div className="relative h-full">
        <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full text-violet-400 dark:text-violet-500">
          <path d="M12 25 L42 10 M12 25 L42 40 M42 10 L72 25 M42 40 L72 25 M72 25 L90 15 M72 25 L90 35" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.4" />
          <rect x="6" y="20" width="12" height="10" rx="2" fill="currentColor" opacity="0.8" />
          <rect x="36" y="5" width="12" height="10" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="36" y="35" width="12" height="10" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="66" y="20" width="12" height="10" rx="2" fill="currentColor" opacity="0.8" />
          <circle cx="90" cy="15" r="3" fill="currentColor" opacity="0.5" />
          <circle cx="90" cy="35" r="3" fill="currentColor" opacity="0.5" />
        </svg>
        {shortTitle && <span className="absolute bottom-1 left-2 text-[8px] font-medium text-violet-500/70 dark:text-violet-400/60">{shortTitle}</span>}
      </div>,
    )
  }

  // default: document — first page with title + paragraphs + list
  return page(
    <div className="px-3 pt-2.5">
      {shortTitle ? (
        <div className="text-[10px] font-bold leading-tight text-slate-800 dark:text-slate-200">{shortTitle}</div>
      ) : (
        <div className="h-1.5 w-2/5 rounded bg-slate-700/80 dark:bg-slate-300/80" />
      )}
      <div className="mt-0.5 h-1 w-1/3 rounded bg-sky-300 dark:bg-sky-500/40" />
      <div className="mt-2 space-y-1">
        <div className={`h-1 w-full ${line}`} />
        <div className={`h-1 w-11/12 ${line}`} />
        <div className={`h-1 w-4/6 ${line}`} />
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-sky-400" /><div className={`h-1 w-3/4 ${line}`} /></div>
        <div className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-sky-400" /><div className={`h-1 w-2/3 ${line}`} /></div>
        <div className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-sky-400" /><div className={`h-1 w-1/2 ${line}`} /></div>
      </div>
    </div>,
  )
}

// ─── More menu (⋯) ─────────────────────────────────────────────────────
function ArtifactMoreMenu({
  onOpenConversation,
  onCopyReference,
  onExport,
  onDelete,
}: {
  onOpenConversation: () => void
  onCopyReference: () => void
  onExport: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="更多操作"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onOpenConversation}>
          <Wrench className="size-3.5" />
          打开会话
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyReference}>
          <Check className="size-3.5" />
          复制引用
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <SlidersHorizontal className="size-3.5" />
          导出源码
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Detail panel (right rail) ────────────────────────────────────────
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
  const t = item ? thumbFor(item.type) : null
  return (
    <aside className={cn('hidden shrink-0 self-start rounded-xl border border-slate-200 bg-white shadow-[var(--agenthub-shadow-card)] dark:border-white/10 dark:bg-neutral-900 xl:sticky xl:top-[calc(var(--agenthub-titlebar-height,0px)+1rem)] xl:block', previewOpen ? 'w-[360px] 2xl:w-[380px]' : 'w-[360px]')}>
      {item ? (
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-200 dark:ring-white/10', t?.cover)}>
                {t && <t.Icon className={cn('size-5', t.ink)} />}
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
              <span className={cn('rounded-md px-2 py-1 text-xs', t?.chip)}>{t?.label ?? item.type}</span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">v{item.version}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-neutral-800 dark:text-slate-300">可预览</span>
            </div>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <DetailSection icon={<SlidersHorizontal className="size-4" />} title="元数据" aside={<SavedState />}>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Meta label="创建者" value={item.createdByAgentId ?? 'Agent'} />
                <Meta label="来源会话" value={item.conversationTitle ?? '未命名'} />
                <Meta label="创建时间" value={formatAbsoluteTime(item.createdAt)} />
                <Meta label="更新时间" value={formatAbsoluteTime(item.createdAt)} />
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

// ─── Utilities ────────────────────────────────────────────────────────
// One-line subtitle shown under the card title, derived from real data
// (source conversation + iteration count) — builds the "product" feel.
function describeArtifact(item: ArtifactListItem, typeLabel: string, versions: number): string {
  const source = item.conversationTitle?.trim()
  const iterations = versions > 1 ? `已迭代 ${versions} 个版本` : '初版产出'
  if (source) return `来自「${source}」· ${iterations}`
  return `${typeLabel}产物 · ${iterations}`
}

function resolveAgentName(agents: Record<string, { name: string }>, id: string): string {
  return agents[id]?.name ?? id
}

function resolveAgentObj(agents: Record<string, { id: string; name: string }>, id: string): { id: string; name: string } {
  const found = agents[id]
  if (found) return { id: found.id ?? id, name: found.name }
  return { id, name: id }
}

function formatRelativeTime(value: number): string {
  const diff = Math.max(0, Date.now() - value)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatAbsoluteTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
