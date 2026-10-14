'use client'

import { AlertTriangle, Download, ExternalLink, Globe } from 'lucide-react'
import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { isHttpUrl } from '@/lib/site-links'
import type { SiteLinksView } from '@/lib/api'

/**
 * 设置面板「官网」页。
 *
 * 与 `OssPanel` 同一套约定：**受控组件、不自带保存按钮** —— 弹窗底部已经有了一个
 * 「保存」，这里再来一个就会出现「点了底部保存、弹窗关了、这一页的改动还晾在原处」。
 * 字段状态与提交动作统一由 `SettingsDialog` 持有。
 *
 * 这里刻意显示「主页上那个按钮**当前**指向哪」：下载地址是「配置项 + 派生值」的组合，
 * 不让用户看见派生结果，就会出现「我明明没填、页面上却有个地址」的困惑。
 * 预览用的是**表单里的实时值**（而不是已保存值），所以边打字边能看到结果。
 *
 * ❗ 本页所有展示出来的地址都必须是**可点击跳转**的链接。理由是这一页的唯一职责就是
 * 「确认这两个地址指向的对不对」，而字符串本身没法验证 —— 用户只能自己复制到地址栏。
 * 现成的一对反例：官网地址曾在页面上只是输入框里的文本，填完看不到任何结果，
 * 于是「设置里填了、工作台左下角却还是没有入口」只能靠猜。
 */

export interface SiteFormValues {
  officialWebsiteUrl: string
  desktopDownloadUrl: string
}

/**
 * 把地址变成「点了能开」的 href。
 *
 * - 绝对 `http(s)://` → 原样使用；
 * - 站内相对路径（本站兜底地址 `/downloads/…`） → 用当前 origin 补全。
 *   必须补全：桌面端 `electron/main.ts` 的 `setWindowOpenHandler` 把新窗口请求
 *   直接交给 `shell.openExternal`，一个裸相对路径 `shell.openExternal` 是打不开的
 *   （它会被静默 catch 掉，表现为「点了没反应」）。
 * - 其余（空、`javascript:`、非法串）→ null，调用方不渲染成链接。
 */
function toOpenableHref(url: string): string | null {
  const trimmed = url.trim()
  if (isHttpUrl(trimmed)) return trimmed
  if (trimmed.startsWith('/') && typeof window !== 'undefined') {
    try {
      return new URL(trimmed, window.location.origin).href
    } catch {
      return null
    }
  }
  return null
}

/** 统一的「打开」外观：能点时是链接，不能点时是同尺寸的灰占位（避免行高抖动）。 */
function OpenAffordance({ href, title }: { href: string | null; title: string }) {
  const className =
    'inline-flex h-8 flex-none items-center gap-1 rounded-lg border px-2 text-xs font-medium'
  if (!href) {
    return (
      <span
        className={`${className} border-dashed text-muted-foreground/50`}
        title="填入以 http:// 或 https:// 开头的地址后即可打开"
      >
        打开
        <ExternalLink className="size-3.5" />
      </span>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} text-muted-foreground transition hover:border-slate-300 hover:text-foreground dark:hover:border-white/25`}
      title={title}
    >
      打开
      <ExternalLink className="size-3.5" />
    </a>
  )
}

/** 地址输入框（输入框 + 右侧「打开」+ 说明）。两处字段共用，避免一边加了按钮另一边忘了。 */
function UrlField({
  id,
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  hint: ReactNode
  onChange: (next: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode="url"
          className="min-w-0 flex-1"
        />
        {/* 用**输入框里的实时值**打开：改完能立刻验证，不必先保存再切页。 */}
        <OpenAffordance href={toOpenableHref(value)} title="在新标签打开这个地址" />
      </div>
      {hint}
    </div>
  )
}

export function SitePanel({
  values,
  links,
  onChange,
}: {
  values: SiteFormValues
  /** 服务端解析结果（含已保存状态下的生效地址、OSS 是否公共读、站内约定路径） */
  links: SiteLinksView | null
  onChange: (patch: Partial<SiteFormValues>) => void
}) {
  const custom = values.desktopDownloadUrl.trim()
  // 实时预览：填了就按自定义算，没填就看服务端推导出来的那一个。
  const preview = custom
    ? { url: custom, source: 'custom' as const, available: true }
    : links?.desktopDownload ?? null

  const savedOfficial = links?.officialWebsiteUrl?.trim() ?? ''
  const officialHref = toOpenableHref(savedOfficial)

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">官网地址</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              工作台左下角会多出一个「官网」入口，点击在新标签打开这里。
            </p>
          </div>
        </div>

        <UrlField
          id="official-website-url"
          label="官网地址"
          value={values.officialWebsiteUrl}
          placeholder="http://121.40.240.236/home"
          onChange={(next) => onChange({ officialWebsiteUrl: next })}
          hint={
            <p className="text-xs leading-4 text-muted-foreground">
              通常就是本项目主页的公网地址。
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                留空则不显示该入口
              </strong>
              —— 宁可不显示，也不要一个点开是 404 的死链。
            </p>
          }
        />

        {/* 「已保存并生效」与上面输入框可能不一致（改了还没保存），所以分开呈现。 */}
        {savedOfficial ? (
          <div className="mt-3 rounded-md border bg-background px-2 py-2">
            <p className="text-xs font-medium">设置里已保存</p>
            <a
              href={officialHref ?? savedOfficial}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <span className="break-all font-mono">{savedOfficial}</span>
              <ExternalLink className="mt-0.5 size-3 shrink-0" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              这就是工作台左下角「官网」入口此刻指向的地址。
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed bg-background px-2 py-2">
            <p className="text-xs leading-4 text-muted-foreground">
              还没保存过官网地址 —— 工作台左下角
              <strong className="font-medium">不会</strong>
              出现「官网」入口。
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-3 flex items-center gap-2">
          <Download className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">桌面端安装包</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              主页「下载桌面端」分区的按钮指向这里。
            </p>
          </div>
        </div>

        <UrlField
          id="desktop-download-url"
          label="安装包下载地址"
          value={values.desktopDownloadUrl}
          placeholder="留空即自动推导（阿里云 OSS → 本站静态目录）"
          onChange={(next) => onChange({ desktopDownloadUrl: next })}
          hint={
            <p className="text-xs leading-4 text-muted-foreground">
              想托管到自己的阿里云 OSS 时，把对象地址直接填在这里最省事；留空则由下面两条规则自动推导。
            </p>
          }
        />

        <div className="mt-3 rounded-md border bg-background p-2">
          <p className="text-xs font-medium text-muted-foreground">留空时的推导顺序</p>
          <ol className="mt-1.5 flex list-none flex-col gap-1 text-xs leading-4 text-muted-foreground">
            <li>
              <span className="font-mono">1.</span> 阿里云 OSS 四项齐备 →{' '}
              <code className="break-all font-mono">
                {links && links.desktopDownload.source === 'oss'
                  ? links.desktopDownload.url
                  : 'https://<bucket>.<endpoint>/downloads/Multi-Agent-TeamFlow-Setup.exe'}
              </code>
            </li>
            <li>
              <span className="font-mono">2.</span> 否则用本站静态目录 →{' '}
              <code className="font-mono">{links?.localInstallerPath ?? 'public/downloads/…'}</code>
            </li>
          </ol>
        </div>

        {preview && (
          <div className="mt-3 rounded-md border bg-background px-2 py-2">
            <p className="text-xs font-medium">主页按钮当前指向</p>
            <a
              href={toOpenableHref(preview.url) ?? preview.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <span className="break-all font-mono">{preview.url}</span>
              <ExternalLink className="mt-0.5 size-3 shrink-0" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              来源：
              {preview.source === 'custom'
                ? '本页手工填写'
                : preview.source === 'oss'
                  ? '阿里云 OSS（由「对象存储」页配置推导）'
                  : '本站静态目录'}
              {preview.source === 'local' && !preview.available && ' · 文件还没放上去'}
              {preview.source === 'oss' && links && !preview.available && ' · 远端探测未通过'}
            </p>
          </div>
        )}

        {/* 下面几个提醒只在特定组合下才成立，措辞必须精确 —— 说错会把人引向错误的操作。 */}

        {/* 手填的地址不探测：这里明说清楚，免得用户以为「填了就是绿的」。 */}
        {preview?.source === 'custom' && (
          <p className="mt-3 text-xs leading-4 text-muted-foreground">
            手填的地址按「你已经确认过」处理，服务端<strong className="font-medium">不会</strong>再去探测它 —— 但也意味着填错的话，
            主页上就是一个点开报错的链接。想省心就留空，让下面两条规则自动推导。
          </p>
        )}

        {preview?.source === 'oss' && !preview.available && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <p className="min-w-0 text-xs leading-4">
              远端探测
              {links?.remoteProbe === 'unreachable'
                ? '请求失败（网络或超时）'
                : '没找到这个对象'}
              ，所以主页此刻显示的是「安装包准备中」而不是一个会 404 的下载按钮。把安装包上传到
              <code className="mx-1 font-mono">downloads/</code>
              目录并把对象设为公共读即可（最长 60 秒后自动重新探测）。
            </p>
          </div>
        )}

        {preview?.source === 'oss' && links && !links.ossPublicRead && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <p className="min-w-0 text-xs leading-4">
              OSS 当前是<strong className="font-medium">私有读</strong>
              （「对象存储」页的 ACL 开关是关的），这个直连地址会返回 403。
              把安装包对象的 ACL 设为公共读，或在本页直接填一个可公开访问的地址。
            </p>
          </div>
        )}

        {preview?.source === 'local' && !preview.available && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <p className="min-w-0 text-xs leading-4">
              这个文件目前不存在，主页会显示「安装包准备中」而不是一个点了报错的死链。把安装包放到{' '}
              <code className="font-mono">{links?.localInstallerPath}</code>
              （文件名必须是 <code className="font-mono">Multi-Agent-TeamFlow-Setup.exe</code>），
              或上传到 OSS 并把对象设为公共读。
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
