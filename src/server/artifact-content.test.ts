import { describe, expect, it } from 'vitest'

import { buildArtifactContent, describeArtifactContentError } from './artifact-content'

describe('buildArtifactContent', () => {
  it('document: 标准对象 { format, content }', () => {
    expect(buildArtifactContent('document', { format: 'markdown', content: '# hi' })).toEqual({
      type: 'document',
      format: 'markdown',
      content: '# hi',
    })
  })

  it('document: 纯 markdown 字符串', () => {
    expect(buildArtifactContent('document', '# hi')).toEqual({
      type: 'document',
      format: 'markdown',
      content: '# hi',
    })
  })

  it('document: 解开被字符串化的 { format, content } 包装(回归——曾把整段 JSON 当正文)', () => {
    const raw = JSON.stringify({ format: 'markdown', content: '# 番茄钟\n\n正文' })
    expect(buildArtifactContent('document', raw)).toEqual({
      type: 'document',
      format: 'markdown',
      content: '# 番茄钟\n\n正文',
    })
  })

  it('document: 内容恰为非包装 JSON 时保持字面,不误解包', () => {
    expect(buildArtifactContent('document', '{"foo":1}')).toEqual({
      type: 'document',
      format: 'markdown',
      content: '{"foo":1}',
    })
  })

  it('web_app: 原始 HTML 字符串不会被误当 JSON', () => {
    expect(buildArtifactContent('web_app', '<!doctype html><h1>x</h1>')).toEqual({
      type: 'web_app',
      files: { 'index.html': '<!doctype html><h1>x</h1>' },
      entry: 'index.html',
    })
  })

  it('web_app: 解开被字符串化的 { files, entry } 包装', () => {
    const raw = JSON.stringify({ files: { 'index.html': '<h1>x</h1>' }, entry: 'index.html' })
    expect(buildArtifactContent('web_app', raw)).toEqual({
      type: 'web_app',
      files: { 'index.html': '<h1>x</h1>' },
      entry: 'index.html',
    })
  })

  it('document: 容错解开「内层非法 JSON」包装(\\| 无效转义)', () => {
    const raw = '{"format":"markdown","content":"表格 a \\| b 结束"}'
    expect(buildArtifactContent('document', raw)).toEqual({
      type: 'document',
      format: 'markdown',
      content: '表格 a \\| b 结束',
    })
  })

  it('document: 容错解开「尾部有杂字符」的包装', () => {
    const raw = '{"format":"markdown","content":"hi"} trailing-junk'
    expect(buildArtifactContent('document', raw)).toEqual({
      type: 'document',
      format: 'markdown',
      content: 'hi',
    })
  })

  it('web_app: 容错解开内层非法 JSON(\\|)的多文件包装', () => {
    const raw = '{"files":{"index.html":"<h1>x \\| y</h1>","style.css":"a{}"},"entry":"index.html"}'
    expect(buildArtifactContent('web_app', raw)).toEqual({
      type: 'web_app',
      files: { 'index.html': '<h1>x \\| y</h1>', 'style.css': 'a{}' },
      entry: 'index.html',
    })
  })

  it('diff: 标准 hunks 对象', () => {
    expect(
      buildArtifactContent('diff', {
        targetArtifactId: 'art_target',
        hunks: [
          {
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 2,
            lines: [' import x', '-const a = 1', '+const a = 2'],
          },
        ],
      }),
    ).toEqual({
      type: 'diff',
      targetArtifactId: 'art_target',
      applied: false,
      hunks: [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 2,
          lines: [' import x', '-const a = 1', '+const a = 2'],
        },
      ],
    })
  })

  it('diff: 标准 hunks 中混入 hunk header 时会过滤', () => {
    expect(
      buildArtifactContent('diff', {
        targetArtifactId: 'art_target',
        hunks: [
          {
            oldStart: 10,
            oldLines: 2,
            newStart: 11,
            newLines: 2,
            lines: ['@@ -10,2 +11,2 @@', ' old', '-line a', '+line b'],
          },
        ],
      }),
    ).toEqual({
      type: 'diff',
      targetArtifactId: 'art_target',
      applied: false,
      hunks: [
        {
          oldStart: 10,
          oldLines: 2,
          newStart: 11,
          newLines: 2,
          lines: [' old', '-line a', '+line b'],
        },
      ],
    })
  })

  it('diff: 从 unified diff 字符串解析 hunks', () => {
    expect(
      buildArtifactContent('diff', {
        targetArtifactId: 'art_target',
        diff: '@@ -10,2 +10,2 @@\n old\n-line a\n+line b',
      }),
    ).toEqual({
      type: 'diff',
      targetArtifactId: 'art_target',
      applied: false,
      hunks: [
        {
          oldStart: 10,
          oldLines: 2,
          newStart: 10,
          newLines: 2,
          lines: [' old', '-line a', '+line b'],
        },
      ],
    })
  })

  it('code_file: 标准 workspace metadata 对象', () => {
    expect(
      buildArtifactContent('code_file', {
        workspacePath: 'src/app/page.tsx',
        language: 'typescript',
        sizeBytes: 123,
        checksum: 'abc',
      }),
    ).toEqual({
      type: 'code_file',
      workspacePath: 'src/app/page.tsx',
      language: 'typescript',
      sizeBytes: 123,
      checksum: 'abc',
    })
  })

  it('diagram: Mermaid 标准对象', () => {
    expect(
      buildArtifactContent('diagram', {
        syntax: 'mermaid',
        source: 'flowchart TD\nA-->B',
        theme: 'neutral',
      }),
    ).toEqual({
      type: 'diagram',
      syntax: 'mermaid',
      source: 'flowchart TD\nA-->B',
      theme: 'neutral',
    })
  })

  it('diagram: 纯 Mermaid 字符串', () => {
    expect(buildArtifactContent('diagram', 'sequenceDiagram\nA->>B: hello')).toEqual({
      type: 'diagram',
      syntax: 'mermaid',
      source: 'sequenceDiagram\nA->>B: hello',
    })
  })

  it('diagram: 自动规整 flowchart 中文与数学标签', () => {
    expect(
      buildArtifactContent(
        'diagram',
        [
          'flowchart LR',
          '    A[研究背景: 堆叠智能超表面SIM]',
          '    subgraph C[本文提出的通用多端口网络框架]',
          '        C21[全局矩阵求逆复杂度 从O(LN)^3 降至 O(L*N^2)]',
          '    end',
          '    A --> C',
          '    style A fill:#1A3C6E,color:#fff,font-weight:bold',
        ].join('\n'),
      ),
    ).toEqual({
      type: 'diagram',
      syntax: 'mermaid',
      source: [
        'flowchart LR',
        '    A["研究背景: 堆叠智能超表面SIM"]',
        '    subgraph C["本文提出的通用多端口网络框架"]',
        '        C21["全局矩阵求逆复杂度 从O(LN)^3 降至 O(L*N^2)"]',
        '    end',
        '    A --> C',
        '    style A fill:#1A3C6E,color:#fff,font-weight:bold',
      ].join('\n'),
    })
  })

  it('diagram: 返回可操作的 Mermaid 校验错误', () => {
    const source = 'flowchart LR\nA["开始"]\nstyle A fill:#fff 这里混入了正文'

    expect(buildArtifactContent('diagram', source)).toBeNull()
    expect(describeArtifactContentError('diagram', source)).toBe(
      'Invalid Mermaid diagram: Line 3: invalid style syntax. Use "style ID fill:#hex,color:#hex" without trailing prose.\nstyle A fill:#fff 这里混入了正文',
    )
  })

  it('ppt: 标准 { slides } 对象', () => {
    expect(
      buildArtifactContent('ppt', {
        title: '季度汇报',
        slides: [
          { title: '封面', layout: 'title' },
          { title: '要点', bullets: ['一', '二'] },
        ],
      }),
    ).toEqual({
      type: 'ppt',
      title: '季度汇报',
      slides: [
        { title: '封面', layout: 'title' },
        { title: '要点', bullets: ['一', '二'] },
      ],
    })
  })

  it('ppt: 顶层数组当作 slides', () => {
    expect(buildArtifactContent('ppt', [{ title: 'A' }, { title: 'B', bullets: ['x'] }])).toEqual({
      type: 'ppt',
      slides: [{ title: 'A' }, { title: 'B', bullets: ['x'] }],
    })
  })

  it('ppt: bullets 字符串按行拆 + points 别名', () => {
    expect(
      buildArtifactContent('ppt', {
        slides: [
          { title: 'A', bullets: '一\n二\n' },
          { title: 'B', points: ['x', 'y'] },
        ],
      }),
    ).toEqual({
      type: 'ppt',
      slides: [
        { title: 'A', bullets: ['一', '二'] },
        { title: 'B', bullets: ['x', 'y'] },
      ],
    })
  })

  it('ppt: 过滤空页（无 title 且无 bullets）', () => {
    expect(
      buildArtifactContent('ppt', {
        slides: [{ title: 'keep' }, {}, { bullets: [] }, { notes: 'only notes' }],
      }),
    ).toEqual({
      type: 'ppt',
      slides: [{ title: 'keep' }],
    })
  })

  it('ppt: 非法 layout 忽略 + theme 旧字段(primaryColor/fontFace)映射 + 剥 #', () => {
    expect(
      buildArtifactContent('ppt', {
        theme: { primaryColor: '#1E40AF', fontFace: 'Arial' },
        slides: [{ title: 'A', layout: 'fancy' }],
      }),
    ).toEqual({
      type: 'ppt',
      theme: { primary: '1E40AF', fontHeading: 'Arial' },
      slides: [{ title: 'A' }],
    })
  })

  it('ppt: theme 完整 token + 别名(positive/danger/bg) 规整', () => {
    expect(
      buildArtifactContent('ppt', {
        theme: {
          primary: '#1A3C6E',
          bg: '#F8F9FA',
          textBody: '2C3E50',
          positive: '2B7A4B',
          danger: '#C0392B',
          fontHeading: 'Inter',
          fontBody: 'Inter',
        },
        slides: [{ title: 'A', bullets: ['x'] }],
      }),
    ).toEqual({
      type: 'ppt',
      theme: {
        primary: '1A3C6E',
        background: 'F8F9FA',
        textBody: '2C3E50',
        accentPositive: '2B7A4B',
        accentNegative: 'C0392B',
        fontHeading: 'Inter',
        fontBody: 'Inter',
      },
      slides: [{ title: 'A', bullets: ['x'] }],
    })
  })

  it('ppt: 解开被字符串化的 { slides } 包装', () => {
    const raw = JSON.stringify({ slides: [{ title: 'A', bullets: ['x'] }] })
    expect(buildArtifactContent('ppt', raw)).toEqual({
      type: 'ppt',
      slides: [{ title: 'A', bullets: ['x'] }],
    })
  })

  it('ppt: 接受增强 blocks 并过滤不支持的 block', () => {
    expect(
      buildArtifactContent('ppt', {
        slides: [
          {
            title: 'Metrics',
            subtitle: 'Q2',
            layout: 'metrics',
            blocks: [
              { type: 'metric', label: '收入', value: '1200万', change: '+18%', tone: 'positive' },
              { type: 'unknown', text: 'ignored' },
              {
                type: 'timeline',
                items: [
                  { label: 'Q1', title: '启动', text: '完成验证' },
                  { label: '', title: 'ignored' },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: 'ppt',
      slides: [
        {
          title: 'Metrics',
          subtitle: 'Q2',
          layout: 'metrics',
          blocks: [
            { type: 'metric', label: '收入', value: '1200万', change: '+18%', tone: 'positive' },
            { type: 'timeline', items: [{ label: 'Q1', title: '启动', text: '完成验证' }] },
          ],
        },
      ],
    })
  })

  it('ppt: 拒绝内联 data URI 二进制 payload', () => {
    expect(
      buildArtifactContent('ppt', {
        slides: [
          {
            title: 'Image',
            blocks: [{ type: 'paragraph', text: 'ok' }],
            image: 'data:image/png;base64,AAAA',
          },
        ],
      }),
    ).toBeNull()
  })

  it('非法输入返回 null', () => {
    expect(buildArtifactContent('document', 123)).toBeNull()
    expect(buildArtifactContent('diff', { targetArtifactId: 'art_target', hunks: [] })).toBeNull()
    expect(buildArtifactContent('code_file', { language: 'typescript' })).toBeNull()
    expect(buildArtifactContent('diagram', { syntax: 'plantuml', source: '@startuml\n@enduml' })).toBeNull()
    expect(buildArtifactContent('diagram', { source: '' })).toBeNull()
    expect(buildArtifactContent('ppt', { slides: [] })).toBeNull()
    expect(buildArtifactContent('ppt', { slides: [{}] })).toBeNull()
    expect(buildArtifactContent('ppt', 123)).toBeNull()
  })
})
