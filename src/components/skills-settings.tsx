'use client'

import { Loader2, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { StatusBadge, WorkspaceStateView } from '@/components/workbench-primitives'
import { fetchSkills, refreshSkills, updateSkill, type SkillListItem } from '@/lib/api'

export function SkillsSettings() {
  const [skills, setSkills] = useState<SkillListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSkills(await fetchSkills())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = async () => {
    setBusy(true)
    setError(null)
    try {
      setSkills(await refreshSkills())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (skill: SkillListItem) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateSkill(skill.id, { enabled: !skill.enabled })
      setSkills((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const state = error ? 'error' : loading && skills.length === 0 ? 'loading' : skills.length === 0 ? 'empty' : 'ready'

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Skills</h3>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            Skills 是注入到 Agent 提示词中的行为规则与流程模板，不会执行代码。
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy || loading} onClick={() => void refresh()}>
          {busy || loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
          刷新索引
        </Button>
      </div>
      <WorkspaceStateView
        state={state}
        title="暂无 Skills"
        emptyDescription="刷新索引可扫描本地 skills/ 目录，也可以从能力中心联网搜索并导入 GitHub Skill。"
        errorDescription={error ?? undefined}
        action={error ? { label: '重试', onClick: () => void load() } : undefined}
      >
        <div className="grid min-w-0 gap-2">
          {skills.map((skill, index) => {
            const hasContent = Boolean(skill.content?.trim())
            return (
            <div key={skill.id} className="agenthub-motion-item min-w-0 rounded-xl border bg-background p-3" style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="break-words">{skill.name}</span>
                    <StatusBadge tone={skill.enabled ? 'success' : 'neutral'}>{skill.enabled ? '已启用' : '已禁用'}</StatusBadge>
                    <StatusBadge tone={hasContent ? 'success' : 'warning'}>{hasContent ? '内容完整' : '仅元数据'}</StatusBadge>
                  </div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{skill.description}</p>
                  <p className="mt-1 truncate text-3xs text-muted-foreground/70" title={skill.sourcePath}>
                    {skill.sourcePath}
                  </p>
                  {skill.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-3xs text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="button" size="sm" variant="outline" className="self-start sm:self-auto" disabled={busy} onClick={() => void toggle(skill)}>
                  {skill.enabled ? '禁用' : '启用'}
                </Button>
              </div>
            </div>
            )
          })}
        </div>
      </WorkspaceStateView>
    </section>
  )
}
