'use client'

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  CloudUpload,
  KeyRound,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

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
  GUIDE_GROUPS,
  GUIDE_ITEMS,
  START_ID,
  findGuideItem,
  type GuideItem,
} from '@/components/user-guide-data'
import { fetchSetupStatus, updateAppSettings, type SetupStatus } from '@/lib/api'
import { BRAND_NAME } from '@/lib/brand'
import { subscribeUiCommand } from '@/lib/ui-command-events'
import { cn } from '@/lib/utils'
import { useAppStore, type AppWorkbenchView, type SettingsSection } from '@/stores/app-store'

/**
 * 首次启动的使用指南。
 *
 * ## 为什么「看过没」存在服务端
 * Electron 桌面端由主进程拉起 Next standalone，端口是 `listen(0)` 拿的**随机临时端口**
 * （`electron/server-bootstrap.ts` → `getFreePort`）。于是 origin = `http://127.0.0.1:<随机>`，
 * **每次启动都不一样**，而 localStorage / sessionStorage 按 origin 分区 ⇒ 存进去下次读不到，
 * 弹窗会无限重现。所以「不再自动弹出」的时间戳落在 `app_settings.user_guide_dismissed_at`。
 *
 * ## 为什么状态要问服务端
 * 「配好了没有」不能在前端靠字段有没有值来判断，否则会出现最误导人的那类 bug：
 * 指南说「已配置」，Agent 一启动却报 `<PROVIDER>_API_KEY not set`。
 * 这里直接复用运行时判定的同一份实现（`/api/setup-status`）。
 *
 * 常驻入口：工作台导航（桌面侧栏 + 移动端抽屉）的「使用指南」按钮发 `ui-command` 唤起，
 * 见 `app-workbench.tsx`。注意 `sidebar.tsx` 是**无人引用的死代码**，改它不会有任何效果。
 *
 * 内容不在这里维护：条目数据住在 `user-guide-data.ts`，与项目主页的指南分区共用一份真源。
 */

export function UserGuideDialog() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [activeId, setActiveId] = useState<string>(START_ID)

  const setWorkbenchView = useAppStore((s) => s.setWorkbenchView)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const closeSettingsTarget = useAppStore((s) => s.closeSettingsTarget)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchSetupStatus())
    } catch (err) {
      console.error('[UserGuideDialog] load setup status failed', err)
    }
  }, [])

  // 首次进入自动弹出：`guideDismissed` 为 false（服务端从没记过关闭时间）才弹。
  // 一旦用户关过一次，之后只能从侧栏「使用指南」主动打开。
  useEffect(() => {
    let cancelled = false
    void fetchSetupStatus()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        // 带 `?setup=` 深链进来时，设置面板已经先一步弹出来了；这里再叠一层指南
        // 会变成两个模态抢焦点。跳过即可 —— 指南仍能从工作台导航的入口打开。
        if (!next.guideDismissed && !useAppStore.getState().settingsOpen) setOpen(true)
      })
      .catch((err) => console.error('[UserGuideDialog] load setup status failed', err))
    return () => {
      cancelled = true
    }
  }, [])

  // 常驻入口：侧栏按钮发 ui-command 唤起。
  useEffect(
    () =>
      subscribeUiCommand((command) => {
        if (command !== 'open-user-guide') return
        setActiveId(START_ID)
        setOpen(true)
        void refreshStatus()
      }),
    [refreshStatus],
  )

  /** 关闭并记住「看过了」。取消 / 开始使用都算看过，避免每次启动都弹。 */
  const dismiss = async () => {
    setOpen(false)
    try {
      setStatus((prev) => (prev ? { ...prev, guideDismissed: true } : prev))
      await updateAppSettings({ userGuideDismissedAt: Date.now() })
    } catch (err) {
      console.error('[UserGuideDialog] dismiss failed', err)
    }
  }

  /** 跳去设置对应分区：先收掉本弹窗，避免两个模态叠在一起抢焦点。 */
  const goSettings = (section: SettingsSection) => {
    setOpen(false)
    closeSettingsTarget()
    openSettingsTarget(section)
  }

  /** 跳到工作台某个视图。 */
  const goView = (view: AppWorkbenchView) => {
    setOpen(false)
    setWorkbenchView(view)
  }

  const active = findGuideItem(activeId)
  const groups = GUIDE_GROUPS

  const llmReady = status?.llmConfigured ?? false
  const ossReady = status?.ossConfigured ?? false
  const allReady = llmReady && ossReady

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else void dismiss()
      }}
    >
      <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleHelp className="size-4 text-[var(--agenthub-accent)]" aria-hidden="true" />
            使用指南
          </DialogTitle>
          <DialogDescription className="sr-only">
            {BRAND_NAME} 新用户使用指南
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 min-w-0 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
          {/* ─── 左侧分区导航 ─── */}
          <nav
            aria-label="指南分区"
            className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-0"
          >
            {groups.map((group) => (
              <div key={group} className="flex shrink-0 gap-1 md:block md:shrink">
                <p className="hidden px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">
                  {group}
                </p>
                {GUIDE_ITEMS.filter((item) => item.group === group).map((item) => {
                  const selected = item.id === active.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => setActiveId(item.id)}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition md:w-full',
                        selected
                          ? 'bg-[var(--agenthub-accent-soft)] font-medium text-[var(--agenthub-accent)]'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* ─── 右侧内容 ─── */}
          <div className="min-h-0 min-w-0 overflow-y-auto pr-1">
            {active.id === START_ID ? (
              <StartSection
                status={status}
                llmReady={llmReady}
                ossReady={ossReady}
                onGoSettings={goSettings}
                summary={active.summary}
                steps={active.steps}
                notesTitle={active.notesTitle}
                notes={active.notes}
              />
            ) : (
              <ModuleSection item={active} onGoView={goView} onGoSettings={goSettings} />
            )}
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="mr-auto hidden text-[11px] leading-4 text-muted-foreground sm:block">
            {allReady
              ? '两项外部依赖都已就绪，可以开始了。'
              : '先配好 AI 模型；对象存储建议一并配上。'}
          </p>
          <Button variant="outline" onClick={() => void dismiss()}>
            稍后再说
          </Button>
          <Button onClick={() => void dismiss()}>
            {allReady ? '开始使用' : '知道了，去配置'}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 「开始之前」 ────────────────────────────────────────

function StartSection({
  status,
  llmReady,
  ossReady,
  onGoSettings,
  summary,
  steps,
  notesTitle,
  notes,
}: {
  status: SetupStatus | null
  llmReady: boolean
  ossReady: boolean
  onGoSettings: (section: SettingsSection) => void
  summary: string
  steps: string[]
  notesTitle?: string
  notes?: string[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-5 text-muted-foreground">{summary}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <StatusCard
          icon={KeyRound}
          title="AI 模型（必须）"
          ready={llmReady}
          readyText={
            status?.llmProvider
              ? `已配置：${PROVIDER_LABEL[status.llmProvider]}${LLM_SOURCE_HINT[status.llmSource]}`
              : '已配置'
          }
          notReadyText="未配置 —— Agent 一步都跑不动"
          actionLabel="去配置 AI 模型"
          onAction={() => onGoSettings('api-keys')}
        />
        <StatusCard
          icon={CloudUpload}
          title="对象存储 OSS（建议）"
          ready={ossReady}
          readyText={status?.ossSource === 'environment' ? '已启用（来自系统环境变量）' : '已启用'}
          notReadyText="未启用 —— 图片产物只存本机"
          actionLabel="去配置对象存储"
          onAction={() => onGoSettings('oss')}
        />
      </div>

      {!llmReady && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">还没有可用的 AI 模型，现在派任务会失败</p>
            <p className="mt-1 text-[11px] leading-4">
              至少填一家供应商的 API Key（DeepSeek / OpenAI / Anthropic / 火山方舟任选其一）。
              在「供应商」页填完后，可以顺手点一次「测试连接」确认能通。
            </p>
          </div>
        </div>
      )}

      <Section title="三步开跑">
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2 text-[13px] leading-5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--agenthub-accent-soft)] text-[10px] font-semibold text-[var(--agenthub-accent)]">
                {index + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {notesTitle && notes && notes.length > 0 && (
        <Section title={notesTitle}>
          <ul className="flex flex-col gap-1.5">
            {notes.map((note) => (
              <li key={note} className="flex gap-2 text-[12px] leading-5 text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

// ─── 普通模块章节 ───────────────────────────────────────

function ModuleSection({
  item,
  onGoView,
  onGoSettings,
}: {
  item: GuideItem
  onGoView: (view: AppWorkbenchView) => void
  onGoSettings: (section: SettingsSection) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
          <item.icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{item.label}</h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{item.summary}</p>
        </div>
      </div>

      <Section title="怎么用">
        <ol className="flex flex-col gap-1.5">
          {item.steps.map((step, index) => (
            <li key={step} className="flex gap-2 text-[13px] leading-5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {item.tips && item.tips.length > 0 && (
        <Section title="小提示">
          <ul className="flex flex-col gap-1.5">
            {item.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-[12px] leading-5 text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {item.view && (
        <div>
          <Button variant="outline" size="sm" onClick={() => onGoView(item.view as AppWorkbenchView)}>
            打开「{item.label}」
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {item.settings && (
        <div>
          <Button variant="outline" size="sm" onClick={() => onGoSettings(item.settings as SettingsSection)}>
            打开设置面板
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── 小组件 ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <h4 className="mb-2 text-xs font-medium">{title}</h4>
      {children}
    </section>
  )
}

function StatusCard({
  icon: Icon,
  title,
  ready,
  readyText,
  notReadyText,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  ready: boolean
  readyText: string
  notReadyText: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3',
        ready
          ? 'border-green-200 bg-green-50/60 dark:border-green-900/70 dark:bg-green-950/25'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/25',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'size-4 shrink-0',
            ready ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400',
          )}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold">{title}</span>
        {ready ? (
          <CheckCircle2 className="ml-auto size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="ml-auto size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        )}
      </div>
      <p className="text-[12px] leading-4 text-muted-foreground">
        {ready ? readyText : notReadyText}
      </p>
      <Button variant={ready ? 'outline' : 'default'} size="sm" onClick={onAction} className="mt-auto">
        {ready ? '去修改' : actionLabel}
      </Button>
    </div>
  )
}

const PROVIDER_LABEL: Record<NonNullable<SetupStatus['llmProvider']>, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  ark: '火山方舟',
}

/**
 * key 来自环境变量时补一句说明。
 *
 * 自部署场景里「界面里没配、任务却能跑」很常见（key 写在 agenthub.env / .env.local），
 * 不解释的话用户会以为界面坏了，或者反过来把环境变量里的 key 又抄一遍到设置里。
 */
const LLM_SOURCE_HINT: Record<SetupStatus['llmSource'], string> = {
  'provider-row': '',
  'app-settings': '',
  environment: '（来自系统环境变量）',
  none: '',
}
