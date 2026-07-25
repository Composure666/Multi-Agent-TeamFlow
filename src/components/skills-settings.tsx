'use client'

import { Loader2, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { EmptyState, InlineError } from '@/components/workbench-primitives'
import { fetchSkills, refreshSkills, updateSkill, type SkillListItem } from '@/lib/api'
import { cn } from '@/lib/utils'

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

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Skills</h3>
          <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
            Skills 是注入到 Agent 提示词中的行为规则与流程模板，不会执行代码。
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy || loading} onClick={() => void refresh()}>
          {busy || loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
          刷新索引
        </Button>
      </div>
      {error && <InlineError message={error} onRetry={() => void load()} />}
      {!loading && !error && skills.length === 0 && (
        <EmptyState title="暂无 Skills" description="点击右上角刷新索引扫描本地 skills/ 目录，或在 Agent 库中联网搜索并导入 GitHub Skill。" />
      )}
      <div className="grid min-w-0 gap-2">
        {skills.map((skill) => {
          const hasContent = Boolean(skill.content?.trim())
          return (
            <div key={skill.id} className="min-w-0 rounded-xl border bg-background p-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="break-words">{skill.name}</span>
                    {!skill.enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">已禁用</span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        hasContent
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
                      )}
                    >
                      {hasContent ? '内容完整' : '仅元数据'}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[11px] text-muted-foreground">{skill.description}</p>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground/70" title={skill.sourcePath}>
                    {skill.sourcePath}
                  </p>
                  {skill.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
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
    </section>
  )
}
