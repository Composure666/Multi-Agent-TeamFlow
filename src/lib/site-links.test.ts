import { describe, expect, it } from 'vitest'

import {
  DESKTOP_INSTALLER_FILENAME,
  DESKTOP_INSTALLER_LOCAL_PATH,
  buildOssDownloadUrl,
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
