import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SiteLinksView } from '@/lib/api'
import { SitePanel } from './site-panel'

/**
 * 「设置 → 官网」页的**可点击性**回归。
 *
 * 这一页的唯一职责是「确认这两个地址指向的对不对」，而这件事在界面上只有一个成立条件：
 * 地址必须被渲染成真正带 `href` 的链接。此前它只是输入框里的文本 + 一行纯文本预览，
 * 于是「填了到底生效没有」只能靠用户自己复制到地址栏 —— 而且是在**不报错**的情况下。
 *
 * 所以断言直接盯着 `href` 字面量，而不是「有没有渲染出这一段文案」：
 * 文案对了但链接不可点，正是这次要防的那个状态。
 */

const OSS_URL =
  'https://nexora-studio.oss-cn-beijing.aliyuncs.com/downloads/Multi-Agent-TeamFlow-Setup.exe'
const LOCAL_URL = '/downloads/Multi-Agent-TeamFlow-Setup.exe'

function baseLinks(overrides: Partial<SiteLinksView> = {}): SiteLinksView {
  return {
    officialWebsiteUrl: null,
    desktopDownload: { url: OSS_URL, source: 'oss', available: true },
    localInstallerPath: 'public/downloads/Multi-Agent-TeamFlow-Setup.exe',
    ossPublicRead: true,
    remoteProbe: 'ok',
    ...overrides,
  }
}

function render(values: { officialWebsiteUrl: string; desktopDownloadUrl: string }, links: SiteLinksView) {
  return renderToStaticMarkup(
    createElement(SitePanel, { values, links, onChange: () => {} }),
  )
}

describe('SitePanel 地址可点击跳转', () => {
  it('已保存的官网地址渲染成带 href 的链接（工作台入口指向的就是它）', () => {
    const html = render(
      { officialWebsiteUrl: '', desktopDownloadUrl: '' },
      baseLinks({ officialWebsiteUrl: 'http://121.40.240.236/home' }),
    )
    expect(html).toContain('href="http://121.40.240.236/home"')
  })

  it('官网地址留空时不给死链，而是如实说明入口不会出现', () => {
    const html = render(
      { officialWebsiteUrl: '', desktopDownloadUrl: '' },
      baseLinks({ officialWebsiteUrl: null }),
    )
    expect(html).not.toContain('href="http://')
    expect(html).toContain('不会')
  })

  it('输入框里的实时值本身也能开（不必先保存再切页）', () => {
    const html = render(
      { officialWebsiteUrl: 'https://example.com', desktopDownloadUrl: '' },
      baseLinks(),
    )
    expect(html).toContain('href="https://example.com"')
  })

  it('半成品地址（缺协议）不会被渲染成链接', () => {
    const html = render(
      { officialWebsiteUrl: '121.40.240.236/home', desktopDownloadUrl: '' },
      baseLinks(),
    )
    expect(html).not.toContain('href="121.40.240.236/home"')
  })

  it('伪协议不会被渲染成链接', () => {
    const html = render(
      { officialWebsiteUrl: 'javascript:alert(1)', desktopDownloadUrl: '' },
      baseLinks(),
    )
    expect(html).not.toContain('href="javascript:')
  })

  it('推导出来的安装包地址（OSS）也是可点链接', () => {
    const html = render(
      { officialWebsiteUrl: '', desktopDownloadUrl: '' },
      baseLinks(),
    )
    expect(html).toContain(`href="${OSS_URL}"`)
  })

  it('手填的安装包地址在预览里可点，并如实标注来源是手填', () => {
    const html = render(
      { officialWebsiteUrl: '', desktopDownloadUrl: 'https://cdn.example.com/setup.exe' },
      baseLinks(),
    )
    expect(html).toContain('href="https://cdn.example.com/setup.exe"')
    expect(html).toContain('本页手工填写')
    // 手填不探测 —— 这句必须留着，否则用户会以为「填了就是验证过的」
    expect(html).toContain('不会')
  })
})

/**
 * 站内兜底地址是相对路径。桌面端 `electron/main.ts` 的 `setWindowOpenHandler`
 * 把新窗口请求直接交给 `shell.openExternal` —— 裸相对路径在那里**打不开且不报错**，
 * 所以必须补全 origin。这段逻辑依赖 `window`，单独一个 describe 包住环境设置。
 */
describe('SitePanel 站内相对路径补全 origin', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://127.0.0.1:3210' } }
  })

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = originalWindow
  })

  it('本站兜底 /downloads/… 被补成绝对地址', () => {
    const html = render(
      { officialWebsiteUrl: '', desktopDownloadUrl: '' },
      baseLinks({ desktopDownload: { url: LOCAL_URL, source: 'local', available: true } }),
    )
    expect(html).toContain(`href="http://127.0.0.1:3210${LOCAL_URL}"`)
  })
})
