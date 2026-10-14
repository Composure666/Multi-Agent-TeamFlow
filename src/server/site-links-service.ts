import { existsSync } from 'node:fs'
import path from 'node:path'

import {
  DESKTOP_INSTALLER_DIR,
  DESKTOP_INSTALLER_FILENAME,
  resolveDesktopDownload,
  type ResolvedDesktopDownload,
} from '@/lib/site-links'
import { resolveOssConfig } from '@/server/oss-image-store'
import { getAppSettings } from '@/server/settings-service'

/**
 * 官网入口 + 桌面端安装包地址的**唯一解析口径**。
 *
 * 谁会调它：
 *  - 主页 `/home`（服务端组件）—— 直接调用，不走 HTTP。免鉴权的公开页也必须拿到这些值；
 *  - `/api/site-links` —— 工作台的「官网」入口与设置面板的实时预览。
 *
 * 刻意只留这一份实现：设置面板显示「生效地址是 OSS」而页面上按钮却指到本站，是这类
 * 「配置项 + 派生值」最容易出的自相矛盾，靠单一函数收敛掉。
 */

/** 对「推导出来的远端地址」的探测结论。 */
export type RemoteProbe = 'ok' | 'missing' | 'unreachable' | 'skipped'

export interface SiteLinks {
  /** 官网地址；null = 未配置（工作台不显示入口，宁可没有也不要死链） */
  officialWebsiteUrl: string | null
  /** 主页下载按钮的目标 + 来源 + 是否可用 */
  desktopDownload: ResolvedDesktopDownload
  /** 站内约定位置（只用于在界面上告诉站长「文件该放哪」，刻意用相对路径，不泄露服务器绝对路径） */
  localInstallerPath: string
  /** OSS 当前 ACL 是否公共读 —— 若为 false，推导出来的 OSS 直连地址会 403 */
  ossPublicRead: boolean
  /** 远端探测结论，供设置页如实说明「按钮为什么没出现」 */
  remoteProbe: RemoteProbe
}

/**
 * 探测站点静态目录里到底有没有安装包。
 *
 * 用途只有一个：决定主页显示「下载」还是「安装包准备中」。任何异常（权限、路径不存在）
 * 都当「没有」处理 —— 探测失败绝不该让整个首页崩掉。
 */
function localInstallerExists(): boolean {
  try {
    return existsSync(
      path.join(process.cwd(), 'public', DESKTOP_INSTALLER_DIR, DESKTOP_INSTALLER_FILENAME),
    )
  } catch {
    return false
  }
}

/**
 * 远端安装包探测的缓存。
 *
 * 为什么必须有缓存：主页是**公开页**，每次渲染都去外网打一枪是不可接受的；
 * 而 TTL 又不能太长，否则站长上传完要等很久才看到按钮出现。
 */
const PROBE_TTL_MS = 60_000
let probeCache: { url: string; at: number; result: RemoteProbe } | null = null

/**
 * 对推导出来的地址做一次轻量 HEAD。
 *
 * ❗ 为什么必须探测（而不是「推导出来就当作可用」）：
 * 推导用的 bucket 本来是给**图片产物**配的（线上更是只来自环境变量），
 * 把安装包地址从它推出来属于**猜测**。不验证就会在对象根本没上传时，
 * 给访客一个点开 404 的下载按钮 —— 那正是本轮要避免的那种「看起来做好了」的缺陷。
 *
 * 结论口径：
 *  - 2xx           → ok（对象在，按钮可以给）
 *  - 403           → missing（对象不存在，或 bucket 是私有读；两种情况都不该给按钮）
 *  - 404 / 其它 4xx → missing
 *  - 超时 / 网络错误 → unreachable，同样按「不给按钮」处理并记一条 warn。
 *    对一个下载页来说，「暂时隐藏按钮」远比「给访客一个 404」轻。
 */
async function probeRemoteInstaller(url: string): Promise<RemoteProbe> {
  const now = Date.now()
  if (probeCache && probeCache.url === url && now - probeCache.at < PROBE_TTL_MS) {
    return probeCache.result
  }

  let result: RemoteProbe
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      // 探不通也不能把 /home 拖住：1.5s 封顶，且结论会被缓存 60s
      signal: AbortSignal.timeout(1500),
    })
    result = res.ok ? 'ok' : 'missing'
    if (!res.ok) {
      console.warn(`[site-links] 安装包地址探测未通过（HTTP ${res.status}）：${url}`)
    }
  } catch (err) {
    result = 'unreachable'
    console.warn(`[site-links] 安装包地址探测失败（按不可用处理）：${url}`, err)
  }

  probeCache = { url, at: now, result }
  return result
}

export async function resolveSiteLinks(): Promise<SiteLinks> {
  const [settings, oss] = await Promise.all([getAppSettings(), resolveOssConfig()])
  const cfg = oss.config

  let desktopDownload = resolveDesktopDownload({
    customUrl: settings.desktopDownloadUrl,
    oss: cfg ? { bucket: cfg.bucket, endpoint: cfg.endpoint } : null,
    localFileExists: localInstallerExists(),
  })

  // 派生出来的远端地址要验证，手填的地址不验（判据写在 `lib/site-links.ts`）
  let remoteProbe: RemoteProbe = 'skipped'
  if (desktopDownload.source === 'oss') {
    remoteProbe = await probeRemoteInstaller(desktopDownload.url)
    if (remoteProbe === 'ok') desktopDownload = { ...desktopDownload, available: true }
    else desktopDownload = { ...desktopDownload, available: false }
  }

  return {
    officialWebsiteUrl: settings.officialWebsiteUrl ?? null,
    desktopDownload,
    localInstallerPath: `public/${DESKTOP_INSTALLER_DIR}/${DESKTOP_INSTALLER_FILENAME}`,
    ossPublicRead: cfg?.publicRead ?? settings.ossPublicRead,
    remoteProbe,
  }
}
