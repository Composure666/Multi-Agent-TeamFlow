import { describe, expect, it } from 'vitest'

import { sanitizeExperienceHtml } from '@/lib/sanitize-html'

describe('sanitizeExperienceHtml', () => {
  it('整体剥离 script 块（含内部内容）', () => {
    expect(sanitizeExperienceHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('剥离 on* 事件属性', () => {
    expect(
      sanitizeExperienceHtml('<p onclick="alert(1)">hi</p><img src="https://x.com/a.png" onerror="alert(2)">'),
    ).toBe('<p>hi</p><img src="https://x.com/a.png">')
  })

  it('拒绝 javascript: 与 data: 的 href/src', () => {
    expect(sanitizeExperienceHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeExperienceHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe('<img>')
  })

  it('允许 http(s) 与 mailto 链接', () => {
    expect(sanitizeExperienceHtml('<a href="https://example.com?a=1&b=2">x</a>')).toBe(
      '<a href="https://example.com?a=1&amp;b=2">x</a>',
    )
    expect(sanitizeExperienceHtml('<a href="mailto:a@b.com">x</a>')).toBe('<a href="mailto:a@b.com">x</a>')
  })

  it('保留富文本标签与安全属性', () => {
    const input =
      '<div align="center"><b>加粗</b><i>斜体</i><u>下划线</u></div><ol><li>1</li></ol><ul><li>2</li></ul>'
    expect(sanitizeExperienceHtml(input)).toBe(input)
  })

  it('style 仅保留安全排版声明，拒绝 url()/expression', () => {
    expect(
      sanitizeExperienceHtml('<span style="text-align: center; font-weight: bold">x</span>'),
    ).toBe('<span style="text-align: center; font-weight: bold">x</span>')
    expect(sanitizeExperienceHtml('<span style="background: url(https://evil.com/x)">x</span>')).toBe('<span>x</span>')
    expect(
      sanitizeExperienceHtml('<span style="width: expression(alert(1))">x</span>'),
    ).toBe('<span>x</span>')
  })

  it('非白名单标签整体移除但保留文本内容', () => {
    expect(sanitizeExperienceHtml('<p>a<marquee>b</marquee>c</p>')).toBe('<p>abc</p>')
    expect(sanitizeExperienceHtml('<table><tr><td>x</td></tr></table>')).toBe('x')
  })

  it('剥离 HTML 注释', () => {
    expect(sanitizeExperienceHtml('<p>a</p><!-- <script> --><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('危险块整体剥离（不保留内部文本）', () => {
    expect(sanitizeExperienceHtml('<iframe>payload</iframe>ok')).toBe('ok')
  })

  it('拒绝未知属性', () => {
    expect(sanitizeExperienceHtml('<a href="https://x.com" data-x="1" id="evil">x</a>')).toBe(
      '<a href="https://x.com">x</a>',
    )
  })

  it('font color 仅允许 hex / 颜色名', () => {
    expect(sanitizeExperienceHtml('<font color="#ff0000">x</font>')).toBe('<font color="#ff0000">x</font>')
    expect(sanitizeExperienceHtml('<font color="red">x</font>')).toBe('<font color="red">x</font>')
    expect(sanitizeExperienceHtml('<font color="javascript:alert(1)">x</font>')).toBe('<font>x</font>')
  })

  it('幂等：二次清洗结果不变', () => {
    const dirty = '<p onclick="x">a<script>b</script></p><a href="javascript:c">d</a>'
    const once = sanitizeExperienceHtml(dirty)
    expect(sanitizeExperienceHtml(once)).toBe(once)
  })

  it('空输入安全返回', () => {
    expect(sanitizeExperienceHtml('')).toBe('')
    expect(sanitizeExperienceHtml(null as unknown as string)).toBe('')
  })
})
