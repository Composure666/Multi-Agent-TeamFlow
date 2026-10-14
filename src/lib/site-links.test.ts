import { describe, expect, it } from 'vitest'

import {
  DESKTOP_INSTALLER_FILENAME,
  DESKTOP_INSTALLER_LOCAL_PATH,
  buildOssDownloadUrl,
  isHttpUrl,
  normalizeOssEndpoint,
  resolveDesktopDownload,
} from './site-links'

/**
 * 下载地址是「配置项 + 派生值」的组合，优先级一旦写歪，表现是
 * 「设置页显示 OSS、主页按钮却指到本站」这种自相矛盾 —— 很难从界面上看出来。
 */
describe('resolveDesktopDownload 优先级', () => {
  it('填了自定义地址就一切以它为准（压过 OSS）', () => {
    const r = resolveDesktopDownload({
      customUrl: 'https://cdn.example.com/setup.exe',
      oss: { bucket: 'b', endpoint: 'oss-cn-beijing.aliyuncs.com' },
      localFileExists: true,
    })
    expect(r).toEqual({ url: 'https://cdn.example.com/setup.exe', source: 'custom', available: true })
  })

  it('自定义地址只有空格时视为没填', () => {
    const r = resolveDesktopDownload({
      customUrl: '   ',
      oss: { bucket: 'my-bucket', endpoint: 'oss-cn-beijing.aliyuncs.com' },
      localFileExists: false,
    })
    expect(r.source).toBe('oss')
  })

  it('没填自定义时用 OSS 推导的公网直连地址', () => {
    const r = resolveDesktopDownload({
      customUrl: null,
      oss: { bucket: 'my-bucket', endpoint: 'oss-cn-beijing.aliyuncs.com' },
      localFileExists: false,
    })
    expect(r.source).toBe('oss')
    // 注意：纯函数这里给的是「按规则可用」。真正的结论由
    // `server/site-links-service.ts` 探测远端后覆盖 —— 推导出来的地址必须验证，
    // 否则会在对象没上传时给访客一个点开 404 的按钮。
    expect(r.available).toBe(true)
    expect(r.url).toBe(
      `https://my-bucket.oss-cn-beijing.aliyuncs.com/downloads/${DESKTOP_INSTALLER_FILENAME}`,
    )
  })

  it('OSS 未配置时回退本站，可用性取决于文件在不在', () => {
    const missing = resolveDesktopDownload({ customUrl: null, oss: null, localFileExists: false })
    expect(missing).toEqual({ url: DESKTOP_INSTALLER_LOCAL_PATH, source: 'local', available: false })

    const present = resolveDesktopDownload({ customUrl: null, oss: null, localFileExists: true })
    expect(present.source).toBe('local')
    expect(present.available).toBe(true)
  })
})

describe('OSS 地址拼装', () => {
  it('endpoint 的三种常见写法归一到同一个结果', () => {
    const expected = `https://b.oss-cn-hangzhou.aliyuncs.com/downloads/${DESKTOP_INSTALLER_FILENAME}`
    expect(buildOssDownloadUrl('b', 'oss-cn-hangzhou.aliyuncs.com')).toBe(expected)
    expect(buildOssDownloadUrl('b', 'https://oss-cn-hangzhou.aliyuncs.com')).toBe(expected)
    expect(buildOssDownloadUrl('b', ' https://oss-cn-hangzhou.aliyuncs.com/ ')).toBe(expected)
    expect(normalizeOssEndpoint('https://oss-cn-hangzhou.aliyuncs.com/')).toBe('oss-cn-hangzhou.aliyuncs.com')
  })

  it('本站回退地址与约定文件名同源（改名只需改一处）', () => {
    expect(DESKTOP_INSTALLER_LOCAL_PATH).toBe(`/downloads/${DESKTOP_INSTALLER_FILENAME}`)
  })
})

/**
 * 这个判据的用途是「敢不敢把这个字符串渲染成 `href`」。放行的下限一旦松了，
 * 后果都是静默的：`javascript:` 被点了会执行、半成品地址被点了报错，
 * 而设置页看起来一切正常。
 */
describe('isHttpUrl（设置页判断能不能渲染成可点链接）', () => {
  it('放行正常的 http / https 地址', () => {
    expect(isHttpUrl('http://121.40.240.236/home')).toBe(true)
    expect(isHttpUrl('https://nexora-studio.oss-cn-beijing.aliyuncs.com/downloads/x.exe')).toBe(true)
    expect(isHttpUrl('  https://example.com  ')).toBe(true)
  })

  it('拦下可执行伪协议与半成品', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,<script>x</script>')).toBe(false)
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    // 只贴了主机名 / 只写了协议就停手 —— 渲染成链接只会点开报错
    expect(isHttpUrl('121.40.240.236/home')).toBe(false)
    expect(isHttpUrl('https://')).toBe(false)
    // 站内相对路径（本站兜底地址）由调用方补全 origin，判据本身不算「外部地址」
    expect(isHttpUrl(DESKTOP_INSTALLER_LOCAL_PATH)).toBe(false)
  })

  it('空值一律不放行', () => {
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('   ')).toBe(false)
  })
})
