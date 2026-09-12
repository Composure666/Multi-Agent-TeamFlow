/**
 * artifact preview 子资源 MIME 类型表。
 *
 * 任何进入 `/api/artifacts/[id]/preview/[...path]` 子路由的文件，都按
 * 此表的扩展名映射下发 Content-Type。覆盖范围刻意做得偏全：
 * LLM 产出的 web_app 产物（HTML / CSS / JS / 图片 / 字体 / 视频 / 音频）
 * 与开发态常见静态资源（`.wasm` / `.webmanifest` / source map）都涵盖。
 *
 * 未列出的扩展名一律走 `application/octet-stream`：避免浏览器把未知
 * 二进制当 text/html 渲染，又能在不弹错的前提下提示下载。
 *
 * 该模块被 `route.ts` 引用（保持服务端安全路径），同时也是单测覆盖点
 * （见 `artifact-preview-mime.test.ts`）。
 */

export const ARTIFACT_PREVIEW_MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  // 文档类
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',

  // JS 体系
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  cjs: 'application/javascript; charset=utf-8',

  // 数据交换
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8', // source map 子资源

  // 图片
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',

  // 字体
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',

  // 媒体
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',

  // Web 平台
  wasm: 'application/wasm',
  webmanifest: 'application/manifest+json',
  pdf: 'application/pdf',
})

/** 未识别扩展名的安全 fallback：避免把未知内容当 HTML 渲染 */
export const ARTIFACT_PREVIEW_FALLBACK_MIME = 'application/octet-stream'

export function contentTypeFor(filePath: string): string {
  const cleaned = filePath.split('?')[0]!.split('#')[0]!
  const dot = cleaned.lastIndexOf('.')
  // artifact 子路径在 storage 里始终用 `/` 分隔（route 用 Array.join('/')），
  // 没有 Windows 反斜杠分支的必要；保留单一分隔符以避免误识别
  const slash = cleaned.lastIndexOf('/')
  // 防止 `index.html.bak` 这种点出现在文件名中间的误识别：
  // 实际「扩展名」必须出现在最后一个分隔符之后
  if (dot <= slash || dot === -1) {
    return ARTIFACT_PREVIEW_FALLBACK_MIME
  }
  const ext = cleaned.slice(dot + 1).toLowerCase()
  return ARTIFACT_PREVIEW_MIME_BY_EXT[ext] ?? ARTIFACT_PREVIEW_FALLBACK_MIME
}
