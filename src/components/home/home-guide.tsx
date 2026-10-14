'use client'

import { AlertTriangle, ArrowRight, CheckCircle2, CloudUpload, KeyRound, Settings2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Container, SectionHead, cardClass } from '@/components/home/home-primitives'
import { buttonVariants } from '@/components/ui/button'
import {
  GUIDE_GROUPS,
  GUIDE_ITEMS,
  START_ID,
  findGuideItem,
  type GuideItem,
} from '@/components/user-guide-data'
import { cn } from '@/lib/utils'

/**
 * 项目主页的「使用指南」分区。
 *
 * 与工作台里首启弹窗（`user-guide-dialog.tsx`）的关系：
 *  - **内容同源**：条目都读 `user-guide-data.ts`，不在这里重写一遍文案 —— 两处漂移是最难查的 bug；
 *  - **职责不同**：弹窗是「你现在就在产品里，我告诉你点哪」；这里是「你还没进来，我先告诉你要准备什么、
 *    这个产品由哪些模块组成」。所以本分区**不查实时配置状态**（主页是访客面，服务端的配置状态
 *    对访客毫无意义），只把「必须先配好 AI 模型与 OSS」这条前置条件讲清楚。
 *
 * ❗ 这里曾经给出「去配置 AI 模型 / 去配置对象存储」两个深链（`/?setup=<section>`，落到设置分区）。
 * 2026-10-14 的主页审查判定它必须撤掉：`/` 在**对外托管部署**里位于 nginx Basic 门禁之后，
 * 匿名访客点下去只会弹浏览器原生登录框（模态窗口、吞掉整页事件、控制台零报错）；
 * 而本分区的读者恰恰是「还没装、还没进来」的人 —— 给他们的深链必然是死路。
 * 现在改成**纯文本指引**（写清在应用内的哪个位置配），并由首启弹窗在访客真正进来后再给一次深链。
 *
 * 左导航在 `lg` 以上竖排并吸顶，窄屏塌缩为横向滚动条 —— 与弹窗内保持同一套交互记忆。
 */

export function HomeGuide() {
  const [activeId, setActiveId] = useState<string>(START_ID)
  const active = findGuideItem(activeId)

  return (
    <section id="guide" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="使用指南"
          title="上手前，先把这两件事配好"
          description="AI 模型是必填项 —— 不配就一步都跑不动；对象存储是建议项 —— 不配也能用，只是图片产物留在本机。两项都在「设置」里，随时能改。"
        />

        {/* 前置条件：主页的唯一一处「必须」告警，做成高对比的琥珀条，不埋进折叠内容里 */}
        <div className="mx-auto mt-8 flex max-w-3xl gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900 sm:px-5 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">必须先配置 AI 与 OSS 的 API，否则无法正常使用</p>
            <p className="mt-1 text-sm leading-6">
              至少填一家模型供应商的 API Key（DeepSeek / OpenAI / Anthropic / 火山方舟任选其一）。
              没配 Key 时，新建任务会直接失败并提示「未配置」。对象存储不配不报错，但换机器或重装后
              就拿不到之前的图片产物了。
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* ─── 左：分区导航 ─── */}
          <nav
            aria-label="使用指南分区"
            className={cn(
              cardClass,
              'flex gap-1 overflow-x-auto p-2.5',
              'lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:overflow-y-auto',
            )}
          >
            {GUIDE_GROUPS.map((group) => (
              <div key={group} className="flex shrink-0 gap-1 lg:block lg:shrink">
                <p className="hidden px-3 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600 lg:block">
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
                        'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 lg:w-full',
                        selected
                          ? 'bg-[var(--agenthub-accent-soft)] font-medium text-[var(--agenthub-accent)]'
                          : 'text-slate-600 hover:bg-[var(--agenthub-surface-muted)] hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="whitespace-nowrap lg:truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* ─── 右：当前条目 ─── */}
          <div className={cn(cardClass, 'min-w-0 p-5 sm:p-6 lg:min-h-[27rem]')}>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                <active.icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{active.label}</h3>
                <p className="mt-1 text-sm leading-7 text-slate-600">{active.summary}</p>
              </div>
            </div>

            {active.id === START_ID ? <StartPanel /> : <ModulePanel item={active} />}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href="#download"
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
          >
            下载桌面端
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          <p className="text-sm leading-6 text-slate-600">
            指南里的每个模块，都是工作台左侧栏里真实存在的入口 —— 不是规划图。
          </p>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   「开始之前」：两项外部依赖 + 三步开跑 + 为什么顺序不能反
   ──────────────────────────────────────────────────────────────────────────── */

function StartPanel() {
  const item = findGuideItem(START_ID)

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PrereqCard
          icon={KeyRound}
          title="AI 模型（必须）"
          tone="required"
          description="Agent 的每次思考、规划、写代码都要调用模型。没有可用的 Key，任务会直接报「未配置」。"
          where="装好后打开应用 → 设置 → 供应商，填入任意一家的 API Key"
        />
        <PrereqCard
          icon={CloudUpload}
          title="对象存储 OSS（建议）"
          tone="optional"
          description="图片产物的存放位置。不配也能用，图片只留本机；换机器或重装后就拿不到了。"
          where="装好后打开应用 → 设置 → 对象存储"
        />
      </div>

      <GuideBlock title="三步开跑">
        <ol className="flex flex-col gap-2">
          {item.steps.map((step, index) => (
            <li key={step} className="flex gap-2.5 text-sm leading-6">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--agenthub-accent-soft)] font-mono text-xs font-semibold text-[var(--agenthub-accent)]">
                {index + 1}
              </span>
              <span className="text-slate-600 dark:text-slate-300">{step}</span>
            </li>
          ))}
        </ol>
      </GuideBlock>

      {item.notesTitle && item.notes && (
        <GuideBlock title={item.notesTitle}>
          <ul className="flex flex-col gap-2">
            {item.notes.map((note) => (
              <li key={note} className="flex gap-2.5 text-sm leading-6">
                <span
                  className="mt-2.5 size-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"
                  aria-hidden="true"
                />
                <span className="text-slate-600">{note}</span>
              </li>
            ))}
          </ul>
        </GuideBlock>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   普通模块：怎么用 + 小提示
   ──────────────────────────────────────────────────────────────────────────── */

function ModulePanel({ item }: { item: GuideItem }) {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <GuideBlock title="怎么用">
        <ol className="flex flex-col gap-2">
          {item.steps.map((step, index) => (
            <li key={step} className="flex gap-2.5 text-sm leading-6">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--agenthub-surface-muted)] font-mono text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <span className="text-slate-600 dark:text-slate-300">{step}</span>
            </li>
          ))}
        </ol>
      </GuideBlock>

      {item.tips && item.tips.length > 0 && (
        <GuideBlock title="小提示">
          <ul className="flex flex-col gap-2">
            {item.tips.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-sm leading-6">
                <span
                  className="mt-2.5 size-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"
                  aria-hidden="true"
                />
                <span className="text-slate-600">{tip}</span>
              </li>
            ))}
          </ul>
        </GuideBlock>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   小组件
   ──────────────────────────────────────────────────────────────────────────── */

function GuideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] p-3.5">
      <h4 className="mb-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
      {children}
    </section>
  )
}

/**
 * 前置依赖卡。
 *
 * `tone` 只区分「必填」与「建议」两种语气 —— 主页拿不到也不该拿运行时配置状态，
 * 所以这里刻意**不**渲染「已就绪 / 未就绪」徽标，避免出现「主页说已配置、进去却发现没有」。
 *
 * `where` 是纯文本指引，**刻意不做成链接**（原因见文件顶部注释）。
 */
function PrereqCard({
  icon: Icon,
  title,
  tone,
  description,
  where,
}: {
  icon: LucideIcon
  title: string
  tone: 'required' | 'optional'
  description: string
  where: string
}) {
  const required = tone === 'required'
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border p-3.5',
        required
          ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/30'
          : 'border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)]',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'size-4 shrink-0',
            required ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--agenthub-accent)]',
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        {required ? (
          <AlertTriangle
            className="ml-auto size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2 className="ml-auto size-4 shrink-0 text-slate-400 dark:text-slate-400" aria-hidden="true" />
        )}
      </div>
      <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{description}</p>
      <p className="mt-auto flex items-start gap-1.5 text-sm font-medium text-[var(--agenthub-accent)]">
        <Settings2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{where}</span>
      </p>
    </div>
  )
}
