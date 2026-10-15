import { ArrowRight, ArrowUpRight, ChevronRight, Sparkles, Terminal } from 'lucide-react'
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
import { HomeScreenshotFigure } from '@/components/home/home-screenshot'
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
          <span className="home-rise inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] py-1 pl-1 pr-3 text-sm shadow-sm">
            <span className="rounded-full bg-[var(--agenthub-accent-soft)] px-2 py-0.5 font-mono font-semibold text-[var(--agenthub-accent)]">
              {APP_VERSION}
            </span>
            <span className="font-medium text-slate-600">
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
            className="home-rise mt-5 text-sm font-medium tracking-wide text-slate-600"
            style={{ animationDelay: '110ms' }}
          >
            {BRAND_NAME} · {BRAND_TAGLINE_ZH}
          </p>

          <p
            className="home-rise mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300"
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
            {/* ❗ 目标必须是访客真能到的地方。`/` 在对外托管部署里位于 nginx Basic 门禁之后，
                匿名点下去只会弹浏览器原生登录框（模态窗口、吞掉整页事件、控制台零报错）。 */}
            <a
              href="#download"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
            >
              下载桌面端
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
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
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600"
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
            <a
              href="#download"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-6 h-10 gap-1.5 px-4')}
            >
              下载桌面端
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <ol className="relative flex list-none flex-col gap-7 border-l border-dashed border-[var(--agenthub-border)] pl-6">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  className="absolute -left-9 top-0 flex size-6 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-surface)] font-mono text-xs font-semibold text-[var(--agenthub-accent)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-slate-600">
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
            <code className="font-mono text-sm text-slate-600">
              “做一个咖啡订阅服务的落地页”
            </code>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
            {PIPELINE.map((node, index) => (
              <Fragment key={node.owner}>
                {index > 0 && (
                  <ChevronRight className="size-4 shrink-0 text-slate-300 dark:text-slate-400" aria-hidden="true" />
                )}
                <span className="inline-flex flex-col rounded-xl border border-[var(--agenthub-border)] bg-[var(--agenthub-surface-muted)] px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{node.owner}</span>
                  <span className="text-xs text-slate-600">{node.detail}</span>
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
   界面预览（截图）
   ----------------------------------------------------------------------------
   放在首屏之后、工作流之前：访客往下滚第一屏就该看到「长什么样」，
   而不是先读一大段抽象描述。截图走仓库内静态资源 + onError 占位文案，
   不使用任何外链（离线也能看）。
   ──────────────────────────────────────────────────────────────────────────── */

export function HomeScreenshot() {
  return (
    <section id="preview" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="界面预览"
          title="先看一眼真实界面"
          description="下面这张截图来自真实运行的工作台：左侧是工作区导航与对话历史，右侧是新建任务入口与多 Agent 协作区。"
        />

        <div className="mt-10">
          <HomeScreenshotFigure />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          截图是仓库内的静态资源；若加载失败会显示占位说明。想看真实交互，请下载桌面端或本地启动。
        </p>

        {/* ❗ CTA 目标必须是访客真能到的地方。`/` 在对外托管部署里位于 nginx Basic 门禁之后，
            匿名点下去只会弹浏览器原生登录框（模态窗口、吞掉整页事件、控制台零报错）。 */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#download"
            className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 gap-1.5 px-5')}
          >
            下载桌面端体验
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 gap-1.5 px-5')}
          >
            查看源码
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </Container>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   架构与流程
   ----------------------------------------------------------------------------
   用一张内联 SVG 讲清「目标 → 派单 → 产出 → 收拢」这条主干。
   之所以是内联 SVG 而不是图片：颜色要走 `currentColor` / `--agenthub-*`，
   这样亮暗主题自动生效，且天然随容器缩放、不会因外链失效而空白。
   连接线上的流动虚线由 globals.css 的 `.home-flow-line` 驱动（减少动效时停）。
   ──────────────────────────────────────────────────────────────────────────── */

const ARCH_NODES: { name: string; artifact: string; cx: number }[] = [
  { name: 'PM 小灰', artifact: '产出 PRD', cx: 110 },
  { name: 'UI 设计师', artifact: '产出设计规范', cx: 300 },
  { name: '前端工程师', artifact: '产出 web_app', cx: 490 },
  { name: 'Reviewer', artifact: '产出评审意见', cx: 680 },
]

export function HomeArchitecture() {
  return (
    <section id="architecture" className="home-anchor border-b border-[var(--agenthub-border)]">
      <Container className="py-16 sm:py-20">
        <SectionHead
          eyebrow="架构与流程"
          title="一句话目标进，一件可交付的产物出"
          description="Orchestrator 负责判断与派单，专长 Agent 各产出带类型的产物，全部收进产物库；下游直接读上游产物，不必从对话里重新猜上下文。"
        />

        <figure className={cn(cardClass, 'mt-10 p-5 sm:p-6')}>
          <svg
            viewBox="0 0 800 400"
            className="w-full text-slate-700 dark:text-slate-300"
            role="img"
            aria-label="架构流程图：你的目标交给 Orchestrator 判断与派单，再分发给 PM 小灰、UI 设计师、前端工程师与 Reviewer 四个专长 Agent，各自产出带类型的产物后统一收进产物库，可预览、可导出、可发布为可分享的 URL。"
          >
            <defs>
              <marker
                id="arch-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--agenthub-accent)" />
              </marker>
            </defs>

            {/* 1. 目标 */}
            <rect
              x="310"
              y="12"
              width="180"
              height="46"
              rx="12"
              fill="var(--agenthub-surface-muted)"
              stroke="var(--agenthub-border)"
            />
            <text x="400" y="41" textAnchor="middle" fontSize="14" fill="currentColor">
              你的目标（自然语言）
            </text>

            {/* 目标 → Orchestrator */}
            <path
              d="M400 58 V 88"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              markerEnd="url(#arch-arrow)"
              className="home-flow-line"
            />

            {/* 2. Orchestrator */}
            <rect
              x="290"
              y="88"
              width="220"
              height="56"
              rx="12"
              fill="var(--agenthub-accent-soft)"
              stroke="var(--agenthub-accent-border)"
            />
            <text
              x="400"
              y="112"
              textAnchor="middle"
              fontSize="15"
              fontWeight="600"
              fill="var(--agenthub-accent)"
            >
              Orchestrator
            </text>
            <text x="400" y="131" textAnchor="middle" fontSize="12" fill="currentColor">
              判断 · 拆解 · 派单
            </text>

            {/* Orchestrator → 四个 Agent（派单总线） */}
            <path
              d="M400 144 V 166 M110 166 H 690"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              className="home-flow-line"
            />
            {ARCH_NODES.map((node) => (
              <path
                key={`drop-${node.cx}`}
                d={`M${node.cx} 166 V 190`}
                fill="none"
                stroke="var(--agenthub-accent)"
                strokeWidth="2"
                strokeDasharray="6 6"
                markerEnd="url(#arch-arrow)"
                className="home-flow-line"
              />
            ))}

            {/* 3. 四个专长 Agent */}
            {ARCH_NODES.map((node) => (
              <g key={node.name}>
                <rect
                  x={node.cx - 80}
                  y="190"
                  width="160"
                  height="56"
                  rx="12"
                  fill="var(--agenthub-surface-muted)"
                  stroke="var(--agenthub-border)"
                />
                <text
                  x={node.cx}
                  y="214"
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  fill="currentColor"
                >
                  {node.name}
                </text>
                <text x={node.cx} y="233" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.72">
                  {node.artifact}
                </text>
              </g>
            ))}

            {/* Agent → 产物库（收拢总线） */}
            {ARCH_NODES.map((node) => (
              <path
                key={`collect-${node.cx}`}
                d={`M${node.cx} 246 V 272`}
                fill="none"
                stroke="var(--agenthub-accent)"
                strokeWidth="2"
                strokeDasharray="6 6"
                className="home-flow-line"
              />
            ))}
            <path
              d="M110 272 H 680"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              className="home-flow-line"
            />
            <path
              d="M400 272 V 300"
              fill="none"
              stroke="var(--agenthub-accent)"
              strokeWidth="2"
              strokeDasharray="6 6"
              markerEnd="url(#arch-arrow)"
              className="home-flow-line"
            />

            {/* 4. 产物库 */}
            <rect
              x="260"
              y="300"
              width="280"
              height="56"
              rx="12"
              fill="var(--agenthub-accent-soft)"
              stroke="var(--agenthub-accent-border)"
            />
            <text
              x="400"
              y="324"
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="var(--agenthub-accent)"
            >
              产物库
            </text>
            <text x="400" y="343" textAnchor="middle" fontSize="11" fill="currentColor">
              预览 · 导出 · 发布为可分享 URL
            </text>

            {/* 5. 侧边约束：沙箱与审批 */}
            <rect
              x="20"
              y="300"
              width="200"
              height="56"
              rx="12"
              fill="var(--agenthub-surface-muted)"
              stroke="var(--agenthub-border)"
            />
            <text x="120" y="324" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">
              沙箱工作区
            </text>
            <text x="120" y="343" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.72">
              路径守卫 · 高风险操作审批
            </text>
            <path
              d="M120 300 V 272 H 110"
              fill="none"
              stroke="var(--agenthub-border)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>

          <figcaption className="mt-4 text-center text-xs leading-6 text-slate-500 dark:text-slate-400">
            主干：目标 → Orchestrator 派单 → 专长 Agent 产出带类型产物 → 收进产物库。
            全程在本机完成，文件操作受路径守卫约束，高风险命令需你批准。
          </figcaption>
        </figure>
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
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                {feature.label}
              </h3>
              <p className="mt-1 text-sm font-medium text-[var(--agenthub-accent)]">{feature.tagline}</p>
              <p className="mt-2.5 text-sm leading-6 text-slate-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        <div className={cn(cardClass, 'mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6')}>
          <span className="shrink-0 text-sm font-semibold tracking-wide text-slate-600">
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
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{agent.duty}</p>
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
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] font-mono text-xs font-semibold text-[var(--agenthub-accent)]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
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
              <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
                <Terminal className="size-3" aria-hidden="true" />
                bash · multi-agent-teamflow
              </span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-sm leading-6 text-slate-200">
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
                <div className="truncate text-xs text-slate-600">{BRAND_TAGLINE_EN}</div>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
              本地优先的多 Agent 协作工作空间。所有会话、产物与数据库都在你自己的机器上，无需注册账号，
              也不经过任何云端中转。
            </p>
            <p className="mt-3 font-mono text-xs text-slate-600">
              {APP_VERSION} · AGPL-3.0-only
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {FOOTER_LINKS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">
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
                        className="text-sm leading-6 text-slate-600 outline-none transition-colors hover:text-[var(--agenthub-accent)] focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30"
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
          <p className="text-xs text-slate-600">
            Copyright © 2026 {BRAND_NAME} contributors.
          </p>
          <p className="text-xs leading-6 text-slate-600">
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
