import { ArrowRight, ArrowUpRight, ChevronRight, Sparkles, Terminal } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'

import {
  APP_VERSION,
  ARTIFACT_TYPES,
  BUILTIN_AGENTS,
  FEATURES,
  FOOTER_LINKS,
  PIPELINE,
  QUICKSTART_COMMANDS,
  QUICKSTART_STEPS,
  REPO_URL,
  STACK_GROUPS,
  TRUST_MARKERS,
  UPSTREAM_URL,
  WORKFLOW_STEPS,
} from '@/components/home/home-data'
import { Container, SectionHead, cardClass } from '@/components/home/home-primitives'
import { buttonVariants } from '@/components/ui/button'
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_ZH } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * 项目主页的静态分区（服务端组件）。
 *
 * 设计约束与本项目工作台保持一致：
 *  - 颜色 / 圆角 / 动效一律走 globals.css 的令牌（--agenthub-*、--radius、--agenthub-motion-*），
 *    因此亮暗主题、减少动效偏好都自动生效，不需要在这里写第二套值；
 *  - 卡片规格对齐 `PageCard`（见 `home-primitives.tsx` 的 cardClass）；
 *  - 文本色沿用工作台的 slate 阶梯（globals.css 里已为 .dark 统一重映射）。
 *
 * `Container` / `SectionHead` / `cardClass` 已抽到 `home-primitives.tsx`，
 * 因为「使用指南」分区是客户端组件、也要用同一套版式（理由见该文件顶部注释）。
 */

/* ────────────────────────────────────────────────────────────────────────────
   首屏
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeHero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-[var(--agenthub-border)]">
      <div className="home-hero-decor" aria-hidden="true">
        <div className="home-hero-grid" />
        <div className="home-hero-glow" />
      </div>

      <Container className="relative py-20 sm:py-24 lg:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="home-rise inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] py-1 pl-1 pr-3 text-xs shadow-sm">
            <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 font-mono font-semibold text-[var(--agenthub-accent)]">
              {APP_VERSION}
            </span>
            <span className="font-medium text-slate-500 dark:text-slate-400">
              本地优先的多 Agent 协作工作空间
            </span>
          </span>

          <h1
            className="home-rise mt-6 text-[2.1rem] leading-[1.15] font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1] dark:text-slate-100"
            style={{ animationDelay: '60ms' }}
          >
            把 AI 协作
            <br className="sm:hidden" />
            做成<span className="home-title-accent">一场群聊</span>
          </h1>

          <p
            className="home-rise mt-5 text-sm font-medium tracking-wide text-slate-500 dark:text-slate-400"
            style={{ animationDelay: '110ms' }}
          >
            {BRAND_NAME} · {BRAND_TAGLINE_ZH}
          </p>

          <p
            className="home-rise mt-5 max-w-2xl text-[15px] leading-7 text-slate-600 dark:text-slate-300"
            style={{ animationDelay: '160ms' }}
          >
            不必为每个任务单开一个提示词窗口。这里有内置的调度 Agent 负责把目标拆成子任务、派发给不同专长的
            Agent，再把它们的交付物收拢成可预览、可留存、可复用的一等公民对象 —— 会话、Agent、产物、审批记录与
            SQLite 数据库，全部留在你自己的机器上。
          </p>

          <div
            className="home-rise mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '210ms' }}
          >
            <Link
              href="/"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              进入工作台
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              查看源码
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <ul
            className="home-rise mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
            style={{ animationDelay: '260ms' }}
          >
            {TRUST_MARKERS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                <Icon className="size-3.5 shrink-0 text-[var(--agenthub-accent)]" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   工作流
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeWorkflow() {
  return (
    <section id="workflow" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHead
              align="left"
              eyebrow="工作流"
              title="从一句目标，到一件可交付的产物"
              description="你只需要说清要什么。拆分、派单、传递上下文、评审这些事，交给调度 Agent 和它的同伴。"
            />
            <Link
              href="/"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-6 h-10 gap-1.5 px-4')}
            >
              进入工作台
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <ol className="relative flex list-none flex-col gap-7 border-l border-dashed border-[var(--agenthub-border)] pl-6">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  className="absolute -left-9 top-0 flex size-6 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-surface)] font-mono text-[11px] font-semibold text-[var(--agenthub-accent)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-slate-500 dark:text-slate-400">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className={cn(cardClass, 'mt-14 p-5 sm:p-6')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Sparkles className="size-4 shrink-0 text-[var(--agenthub-accent)]" aria-hidden="true" />
              一条典型的端到端链路
            </div>
            <code className="font-mono text-xs text-slate-400 dark:text-slate-500">
              “做一个咖啡订阅服务的落地页”
            </code>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
            {PIPELINE.map((node, index) => (
              <Fragment key={node.owner}>
                {index > 0 && (
                  <ChevronRight className="size-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                )}
                <span className="inline-flex flex-col rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{node.owner}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{node.detail}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   主要功能模块
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeFeatures() {
  return (
    <section id="features" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="功能模块"
          title="九个模块，覆盖从协作到交付的全过程"
          description="下面这些不是规划图 —— 它们就是工作台侧边栏里真实存在的九个入口，每个都可用。"
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.id} className={cn(cardClass, 'flex flex-col p-5')}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                <feature.icon className="size-[18px]" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                {feature.label}
              </h3>
              <p className="mt-1 text-xs font-medium text-[var(--agenthub-accent)]">{feature.tagline}</p>
              <p className="mt-2.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        <div className={cn(cardClass, 'mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6')}>
          <span className="shrink-0 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            产物类型
          </span>
          <ul className="flex flex-wrap gap-2">
            {ARTIFACT_TYPES.map((type) => (
              <li
                key={type}
                className="rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 py-1 font-mono text-xs text-slate-600 dark:text-slate-300"
              >
                {type}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   内置 Agent
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeAgents() {
  return (
    <section id="agents" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="内置 Agent"
          title="五个开箱即用的角色"
          description="全部走 claude-code 适配器。你也可以用 Agent 构建器自定义适配器、模型、工具与 system prompt。"
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BUILTIN_AGENTS.map((agent) => (
            <article key={agent.name} className={cn(cardClass, 'flex flex-col p-4')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]">
                  <agent.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="agenthub-status-badge agenthub-status-info">{agent.role}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{agent.name}</h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-500 dark:text-slate-400">{agent.duty}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   技术栈
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeStack() {
  return (
    <section id="stack" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="技术栈"
          title="选型全部写在明面上"
          description="没有需要注册的云服务，没有必须联网才能启动的依赖 —— 装完就能离线跑。"
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STACK_GROUPS.map((group) => (
            <div key={group.group} className={cn(cardClass, 'p-5')}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.group}</h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-2 py-1 text-xs text-slate-600 dark:text-slate-300"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   快速开始
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeQuickstart() {
  return (
    <section id="quickstart" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          align="left"
          eyebrow="快速开始"
          title="四条命令，跑起一个本地工作台"
          description="不需要账号，也不需要先部署点什么。首次启动时应用会自动建库并 seed 内置 Agent。"
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:gap-10">
          <ol className="flex list-none flex-col gap-5">
            {QUICKSTART_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <span
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] font-mono text-[11px] font-semibold text-[var(--agenthub-accent)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-slate-500 dark:text-slate-400">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* 终端样式的代码块：这个产品本身就是「带真实终端的工作台」，
              所以这里刻意用深色终端外观，与工作台的 agenthub-terminal-font 语境呼应。 */}
          <div className="overflow-hidden rounded-2xl border border-[var(--agenthub-border)] bg-[#0F1115] dark:bg-[#121418]">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-[#FF5F57]" aria-hidden="true" />
              <span className="size-2.5 rounded-full bg-[#FEBC2E]" aria-hidden="true" />
              <span className="size-2.5 rounded-full bg-[#28C840]" aria-hidden="true" />
              <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                <Terminal className="size-3" aria-hidden="true" />
                bash · multi-agent-teamflow
              </span>
            </div>
            <pre className="agenthub-hide-scrollbar overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6 text-slate-200">
              <code>
                {QUICKSTART_COMMANDS.map((line, index) => (
                  // 空行保留站位，让分组之间有空隙，读起来更像一段真实会话
                  <span key={`${index}-${line}`} className="block">
                    {line || '\u00A0'}
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   页脚
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeFooter() {
  return (
    <footer className="bg-[var(--agenthub-surface)]">
      <Container className="py-12 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-lg bg-[#EAF2FF] bg-cover bg-center bg-no-repeat ring-1 ring-[var(--agenthub-border)]"
                style={{ backgroundImage: "url('/icons/agenthub-mark-32.png')" }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {BRAND_NAME}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{BRAND_TAGLINE_EN}</div>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-xs leading-6 text-slate-500 dark:text-slate-400">
              本地优先的多 Agent 协作工作空间。所有会话、产物与数据库都在你自己的机器上，无需注册账号，
              也不经过任何云端中转。
            </p>
            <p className="mt-3 font-mono text-[11px] text-slate-400 dark:text-slate-500">
              {APP_VERSION} · AGPL-3.0-only
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {FOOTER_LINKS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="text-xs font-semibold tracking-wide text-slate-900 dark:text-slate-100">
                  {column.title}
                </h3>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.href.startsWith('#')
                          ? {}
                          : { target: '_blank', rel: 'noreferrer' })}
                        className="text-xs leading-5 text-slate-500 outline-none transition-colors hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30 dark:text-slate-400"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--agenthub-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Copyright © 2026 {BRAND_NAME} contributors.
          </p>
          <p className="text-xs leading-6 text-slate-400 dark:text-slate-500">
            本项目是{' '}
            <a
              href={UPSTREAM_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--agenthub-accent)]"
            >
              lizyoko9/bitdance-agenthub
            </a>{' '}
            的 AGPL-3.0 衍生作品，AGPL-3.0 第 13 条源码获取方式见 NOTICE.md。
          </p>
        </div>
      </Container>
    </footer>
  )
}
