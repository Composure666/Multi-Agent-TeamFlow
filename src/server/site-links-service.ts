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
export interface SiteLinks {
  /** 官网地址；null = 未配置（工作台不显示入口，宁可没有也不要死链） */
  officialWebsiteUrl: string | null
  /** 主页下载按钮的目标 + 来源 + 是否可用 */
  desktopDownload: ResolvedDesktopDownload
  /** 站内约定位置（只用于在界面上告诉站长「文件该放哪」，刻意用相对路径，不泄露服务器绝对路径） */
  localInstallerPath: string
  /** OSS 当前 ACL 是否公共读 —— 若为 false，推导出来的 OSS 直连地址会 403 */
  ossPublicRead: boolean
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

export async function resolveSiteLinks(): Promise<SiteLinks> {
  const [settings, oss] = await Promise.all([getAppSettings(), resolveOssConfig()])
  const cfg = oss.config

  return {
    officialWebsiteUrl: settings.officialWebsiteUrl ?? null,
    desktopDownload: resolveDesktopDownload({
      customUrl: settings.desktopDownloadUrl,
      oss: cfg ? { bucket: cfg.bucket, endpoint: cfg.endpoint } : null,
      localFileExists: localInstallerExists(),
    }),
    localInstallerPath: `public/${DESKTOP_INSTALLER_DIR}/${DESKTOP_INSTALLER_FILENAME}`,
    ossPublicRead: cfg?.publicRead ?? settings.ossPublicRead,
  }
}
