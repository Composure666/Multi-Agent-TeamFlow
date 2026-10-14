/**
 * 「官网」与「桌面端安装包」的约定 + 优先级解析。
 *
 * 放 lib 而不是 server：这些是**纯函数**，服务端（主页 / 接口）与客户端（设置面板的
 * 实时预览提示）都要用同一份口径。一旦两处各写一遍，就会出现「设置里预览是 OSS、
 * 页面上按钮却指到本站」这种自相矛盾。
 */

/** 安装包在本站静态目录里的位置。`public/downloads/` 会原样出现在站点根路径下。 */
export const DESKTOP_INSTALLER_DIR = 'downloads'

/**
 * 安装包文件名 —— **固定名，不带版本号**。
 *
 * 必须与 `package.json#build.win.artifactName` 展开结果一致（那边写的是
 * `Multi-Agent-TeamFlow-Setup.${ext}`）。改这里就要同步改那里。
 *
 * 为什么刻意不带版本号：下载地址因此**永远不变**。发新版时覆盖同名文件（本地）或同名
 * 对象（OSS）即可 —— 设置不用改、页面不用改、已经发出去的链接也不会失效。要展示的版本号
 * 另有其源（`home-data.ts` 的 `APP_VERSION`），不必塞进文件名。
 */
export const DESKTOP_INSTALLER_FILENAME = 'Multi-Agent-TeamFlow-Setup.exe'

/** 本站回退地址，形如 `/downloads/Multi-Agent-TeamFlow-Setup.exe`。 */
export const DESKTOP_INSTALLER_LOCAL_PATH = `/${DESKTOP_INSTALLER_DIR}/${DESKTOP_INSTALLER_FILENAME}`

/** 下载地址是谁给的：自定义覆盖 / 由 OSS 配置推导 / 本站静态目录兜底。 */
export type DesktopDownloadSource = 'custom' | 'oss' | 'local'

export interface ResolvedDesktopDownload {
  /** 主页「下载」按钮真正指向的地址 */
  url: string
  source: DesktopDownloadSource
  /**
   * 该地址现在是否可用。
   *
   * 判据分两类，刻意不同：
   *  - **手填的自定义地址**：按可用处理。用户已经把确切地址写进设置，那是他的声明，
   *    服务端再去验一遍只会让「临时抖动 = 按钮消失」这种怪事发生。
   *  - **推导出来的地址**（OSS / 本站）：必须验证。OSS 那一条尤其重要 —— 这个 bucket
   *    本来是为「图片产物」配的，把安装包地址从它推导出来是一种**猜测**；不验证就会在
   *    文件根本没上传时给访客一个点开 404 的按钮（线上库的 OSS 来自环境变量，
   *    就是这个场景）。探测逻辑见 `server/site-links-service.ts`。
   */
  available: boolean
}

export interface DesktopDownloadInput {
  /** 设置里手工填的地址（最高优先级） */
  customUrl: string | null
  /** OSS 四项齐备时传入，用于推导公网直连地址 */
  oss: { bucket: string; endpoint: string } | null
  /** 本站 `public/downloads/<文件名>` 是否真的存在 */
  localFileExists: boolean
}

/**
 * endpoint 的写法在不同控制台/文档里不一致（`oss-cn-beijing.aliyuncs.com`、
 * `https://oss-cn-beijing.aliyuncs.com`、带尾斜杠），统一成裸 host 再拼。
 */
export function normalizeOssEndpoint(endpoint: string): string {
  return endpoint
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

/**
 * OSS 公网直连地址（virtual-hosted 风格）。
 *
 * 例：bucket=my-bucket、endpoint=oss-cn-beijing.aliyuncs.com
 *   → https://my-bucket.oss-cn-beijing.aliyuncs.com/downloads/Multi-Agent-TeamFlow-Setup.exe
 *
 * ❗ 这种直连要求对象的 ACL 是公共读（`ossPublicRead`）；私有读会返回 403。
 */
export function buildOssDownloadUrl(
  bucket: string,
  endpoint: string,
  filename: string = DESKTOP_INSTALLER_FILENAME,
): string {
  return `https://${bucket.trim()}.${normalizeOssEndpoint(endpoint)}/${DESKTOP_INSTALLER_DIR}/${filename}`
}

/**
 * 优先级：设置里手填的自定义地址 → OSS 推导 → 本站 `/downloads/`。
 * 推导只此一处，主页 / 接口 / 设置面板共用。
 *
 * 注意本函数是**纯函数**：它只按规则给出「该用哪个地址」以及「按规则算不算可用」
 * （本站那一条要看 `localFileExists`）。对**推导出来的远端地址**的实际探测在
 * `server/site-links-service.ts` 里做 —— 纯函数里不该有网络请求。
 */
export function resolveDesktopDownload(input: DesktopDownloadInput): ResolvedDesktopDownload {
  const custom = input.customUrl?.trim()
  // 手填的地址按用户声明处理，不做探测（理由见 ResolvedDesktopDownload.available）
  if (custom) return { url: custom, source: 'custom', available: true }

  if (input.oss?.bucket && input.oss.endpoint) {
    return {
      url: buildOssDownloadUrl(input.oss.bucket, input.oss.endpoint),
      source: 'oss',
      // 先给 true，真正的结论由服务端探测后覆盖 —— 这里保持纯函数
      available: true,
    }
  }

  return { url: DESKTOP_INSTALLER_LOCAL_PATH, source: 'local', available: input.localFileExists }
}
