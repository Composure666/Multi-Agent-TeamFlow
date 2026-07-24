'use client'

import { Loader2, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
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

  return (
    <section className="min-w-0 space-y-3 overflow-hidden rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Skills</h3>
          <p className="mt-0.5 break-words text-[11px] text-muted-foreground">本地 Skills 只作为 Agent prompt 能力说明注入，不会执行文件内容。</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy || loading} onClick={() => void refresh()}>
          {busy || loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
          刷新索引
        </Button>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</div>}
      <div className="grid min-w-0 gap-2">
        {skills.map((skill) => (
          <div key={skill.id} className="min-w-0 rounded-md border bg-background p-2">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="break-words">{skill.name}</span>
                  {!skill.enabled && <span className="text-[10px] text-muted-foreground">disabled</span>}
                </div>
                <p className="mt-1 break-words text-[11px] text-muted-foreground">{skill.description}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{skill.sourcePath}</p>
                <p className="mt-1 break-words text-[10px] text-muted-foreground">{skill.tags.join(', ')}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="self-start sm:self-auto" disabled={busy} onClick={() => void toggle(skill)}>
                {skill.enabled ? '禁用' : '启用'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
