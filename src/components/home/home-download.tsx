import { Fragment } from 'react'
import { ArrowRight, CheckCircle2, Download, Laptop, Package, ShieldAlert, Terminal } from 'lucide-react'

import { Container, SectionHead, containerCardClass } from '@/components/home/home-primitives'
import { Reveal } from '@/components/home/home-motion'
import { APP_VERSION, QUICKSTART_COMMANDS, REPO_URL } from '@/components/home/home-data'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DESKTOP_INSTALLER_FILENAME, type ResolvedDesktopDownload } from '@/lib/site-links'

/**
 * 主页「桌面端」分区 —— 安装包下载入口。
 *
 * 数据由 `src/app/home/page.tsx` 在服务端解析后传进来（`resolveSiteLinks()`）。
 * 刻意做成「接收 props 的同步组件」而不是自己去取数：主页是服务端组件，
 * 直接调服务端函数即可拿到值，不必为公开页再开一次 HTTP 往返；
 * 而显式传参也避免了「异步子组件」在 RSC 树里嵌套所带来的额外不确定性。
 *
 * ❗ 三种状态必须区分清楚，别混着措辞：
 *   - 自定义 / OSS 地址：按可用处理（对象在不在只有发布者知道，服务端探不到远端）；
 *   - 本站兜底且文件存在：可用；
 *   - 本站兜底但文件不存在：显示「准备中」并把约定路径写出来。
 *     对外是一个诚实的「即将提供」，对站长是一张「文件该放哪」的说明 —— 而不是一个点了 404 的按钮。
 */

const INSTALL_STEPS: { title: string; detail: string }[] = [
  {
    title: '下载并运行安装包',
    detail: 'Windows 10 / 11（x64）。NSIS 安装向导，可自选安装目录，不需要管理员权限以外的额外依赖。',
  },
  {
    title: '首次启动后打开「设置」',
    detail:
      '填一个供应商的 API Key（DeepSeek / OpenAI / Anthropic / 方舟任一即可）；要用图片产物再补上对象存储。两项都可以留到后面再配。',
  },
  {
    title: '开始新建会话',
    detail: '应用会在本机自动建库并准备好 5 个内置 Agent，不需要额外的数据库或服务端。',
  },
]

/** 左侧下载卡片的「运行要求」——三条都是能兑现的事实，不写没验证过的体积数字。 */
const REQUIREMENTS: { label: string; detail: string }[] = [
  { label: '系统', detail: 'Windows 10 / 11（x64）' },
  { label: '依赖', detail: '自带运行时，无需安装 Node.js、pnpm 或数据库' },
  { label: '数据', detail: '全部留在本机，不上传任何服务器' },
]

/** 终端命令在斜杠后放软换行点：长行先在空格处折行，URL 只在斜杠边界断开，不断词中。 */
function renderCommandLine(line: string) {
  return line.split('/').map((segment, index, parts) => (
    <Fragment key={`${index}-${segment}`}>
      {segment}
      {index < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ))
}

export function HomeDownload({
  download,
  localInstallerPath,
}: {
  download: ResolvedDesktopDownload
  /** 站内约定位置，如 `public/downloads/Multi-Agent-TeamFlow-Setup.exe` */
  localInstallerPath: string
}) {
  const external = /^https?:\/\//i.test(download.url)

  return (
    <section id="download" className="home-anchor bg-[var(--agenthub-surface-muted)]">
      <Container className="py-16 sm:py-20">
        {/* 下载区入场动画（frontend-polish 第三轮 Q20）：整区包一个 Reveal，
            与 home-sections.tsx 里截图/工作流/架构/功能四区的包法一致；reduced-motion 时直接显示。 */}
        <Reveal>
        {/* 结尾 CTA 的金色小标记（frontend-polish 金色第四处）：细金线 + 小菱形，仅此一处。 */}
        <div className="mb-8 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-16 bg-[var(--agenthub-gold)]" />
          <span className="size-2 rotate-45 bg-[var(--agenthub-gold)]" />
          <span className="h-px w-16 bg-[var(--agenthub-gold)]" />
        </div>
        <SectionHead
          align="left"
          eyebrow="桌面端"
          title="不想敲命令，也可以装成桌面 App"
          description="同一套工作台，打包成 Windows 安装包：双击装好即用，不需要 Node、pnpm，也不需要先克隆仓库。"
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
          {/* 下载卡片 */}
          <div className={cn(containerCardClass, 'flex flex-col p-6')}>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] text-[var(--agenthub-accent)]"
              >
                <Laptop className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Windows 桌面端
                </div>
                <div className="text-sm text-slate-600">
                  {APP_VERSION} · x64 · NSIS 安装包
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--agenthub-border)] bg-[var(--agenthub-surface)] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Package className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="font-mono">{DESKTOP_INSTALLER_FILENAME}</span>
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {download.available ? (
                <>
                  <a
                    href={download.url}
                    {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 w-fit gap-1.5 px-5')}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    下载 Windows 安装包
                  </a>
                  <p className="text-xs leading-5 text-slate-600">
                    下载地址：<span className="break-all font-mono">{download.url}</span>
                  </p>
                </>
              ) : (
                <>
                  {/* 未就绪：按钮保留形状但不是链接，避免访客点出一个 404。 */}
                  <span
                    aria-disabled="true"
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-10 w-fit cursor-not-allowed gap-1.5 px-5 opacity-60',
                    )}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    安装包准备中
                  </span>
                  <p className="text-xs leading-5 text-slate-600">
                    安装包尚未上传，站点准备好后会在这里直接提供下载。如果你想立刻使用，可以按下面的「快速开始」
                    从源码运行，两者功能完全一致。
                  </p>
                  {download.source === 'oss' ? (
                    <p className="text-xs leading-5 text-slate-500">
                      站点维护者：把 <span className="font-mono">{DESKTOP_INSTALLER_FILENAME}</span>{' '}
                      上传到「设置 → 对象存储」那个 bucket 的{' '}
                      <span className="font-mono">downloads/</span> 目录，并把对象设为公共读，本页会自动出现下载按钮。
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-slate-500">
                      站点维护者：把安装包放到 <span className="font-mono">{localInstallerPath}</span>{' '}
                      （文件名保持 <span className="font-mono">{DESKTOP_INSTALLER_FILENAME}</span>），本页会自动出现下载按钮。
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 运行要求：既是信息，也让左卡片与右侧步骤卡的高度不至于一长一短。 */}
            <dl className="mt-6 grid gap-2.5 border-t border-[var(--agenthub-border)] pt-5">
              {REQUIREMENTS.map((item) => (
                <div key={item.label} className="flex gap-3 text-xs leading-5">
                  <dt className="w-8 shrink-0 font-medium text-slate-900 dark:text-slate-100">{item.label}</dt>
                  <dd className="min-w-0 text-slate-600">{item.detail}</dd>
                </div>
              ))}
            </dl>

            <a
              href="#quickstart"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--agenthub-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30"
            >
              或直接从源码运行（见下方命令）
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>

            <div className="mt-auto flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
              <p className="min-w-0 text-xs leading-5">
                安装包未做代码签名，Windows 首次运行可能弹出 SmartScreen
                提示。选择「更多信息 → 仍要运行」即可；也可以直接从源码运行，二者是同一份代码。
              </p>
            </div>
          </div>

          {/* 安装说明卡片 */}
          <div className={cn(containerCardClass, 'p-6')}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">装好之后</h3>
            <ol className="mt-5 flex list-none flex-col gap-5">
              {INSTALL_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3.5">
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--agenthub-accent-border)] bg-[var(--agenthub-accent-soft)] font-mono text-xs font-semibold text-[var(--agenthub-accent)]"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</h4>
                    <p className="mt-1 text-sm leading-7 text-slate-600">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <ul className="mt-6 flex list-none flex-col gap-2.5 border-t border-[var(--agenthub-border)] pt-5">
              {['数据全部留在本机，不经过任何云端中转', '无需注册账号', '与源码运行共用同一套 SQLite 数据库结构'].map(
                (item) => (
                  <li
                    key={item}
                    className="inline-flex items-start gap-1.5 text-sm font-medium text-slate-600"
                  >
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--agenthub-accent)]" aria-hidden="true" />
                    {item}
                  </li>
                ),
              )}
            </ul>

            <a
              href={`${REPO_URL}/blob/master/INSTALL.md`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--agenthub-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--agenthub-accent)]/30"
            >
              配置与上手说明见安装指南
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* 原独立的「快速开始」分区并入此处：三条命令，不用账号，也不用先部署点什么。
            首次启动时应用会自动建库并 seed 内置 Agent。 */}
        <div id="quickstart" className="home-anchor mt-6 grid gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="lg:self-center">
            <h3 className="font-heading text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              也可以从源码运行
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              克隆仓库、装依赖、填一个 provider 的 API Key，启动即用。首次启动自动建库并准备好 5 个内置 Agent。
            </p>
          </div>

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
            <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-sm leading-6 text-slate-200">
              <code>
                {QUICKSTART_COMMANDS.map((line, index) => (
                  // 空行保留站位，让分组之间有空隙，读起来更像一段真实会话
                  <span key={`${index}-${line}`} className="block">
                    {line ? renderCommandLine(line) : '\u00A0'}
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </div>
        </Reveal>
      </Container>
    </section>
  )
}
