import { describe, expect, it } from 'vitest'

import {
  PROMPT_ENHANCE_SYSTEM_PROMPT,
  buildEnhanceUserMessage,
  buildFallbackEnhancedPrompt,
  extractUserInput,
  isScaffoldEcho,
  resolveEnhancedPrompt,
  sanitizeEnhancedPrompt,
} from './prompt-enhance'

/**
 * 「AI 提示词增强」生成逻辑回归。
 *
 * 背景(2026-09-19):旧产出 = 前端把「会话模式/审批模式/场景分类」拼成请求串 + 系统提示词要求模型
 * 「先判断任务类型、补充必要背景…」,模型不可用时兜底再把请求串套上 `## 原始需求 / ## 任务要求`
 * 脚手架原样吐回 —— 结果是「更长但更不可执行」的系统文档:里面既有内部生成规则,又有跟任务无关的
 * 系统上下文,还没有任何真正补上的信息。
 *
 * 这组用例锁住五条底线:
 * 1. 最终内容只能是「用户可以直接复制执行的提示词」,不得带脚手架、内部规则、寒暄;
 * 2. 系统上下文(会话模式/审批模式/场景分类/Agent 名单)不得出现在输出里;
 * 3. 不得编造事实 —— 兜底路径除原文外只能出现白名单内的通用句式与可替换占位;
 * 4. 简单任务不扩写(原文 + 一句执行说明),复杂任务才补结构;
 * 5. 模型把请求串抄回来时,判为无效产出并走兜底,而不是把脚手架净化后当结果。
 */

/** 旧客户端(缓存页面)会发出的、带系统上下文的脚手架串 */
const LEGACY_PAYLOAD = [
  '请结合上下文增强用户提示词。',
  '',
  '## 当前上下文',
  '- 会话模式：群聊',
  '- 会话标题：爆点营销策划团',
  '- 写入审批模式：Auto（写入直接生效）',
  '- 已 @ Agent：营销总策划',
  '',
  '## 用户原始输入',
  '帮我做一次大厂迎新活动的活动策划',
].join('\n')

/** 旧兜底模板的完整形状(用户截图里的那份) */
const LEGACY_ECHO = [
  '请根据以下原始需求完成任务。',
  '',
  '## 原始需求',
  '帮我做一次大厂迎新活动的活动策划',
  '',
  '## 任务要求',
  '- 先判断这属于哪类任务，并严格围绕原始意图展开。',
  '- 补充必要的背景、目标、受众、约束、输出格式和质量标准。',
  '- 如果这是文案、翻译、学习、分析、产品设计或通用问答，不要加入软件开发模板。',
  '- 输出一段可直接复制使用的优化后提示词。',
].join('\n')

const FORBIDDEN_IN_OUTPUT = ['## 任务要求', '## 原始需求', '先判断', '不要加入软件开发模板', '会话模式', '写入审批模式', '场景分类', '模板']

describe('prompt enhance - 请求解析', () => {
  it('干净原文原样通过', () => {
    expect(extractUserInput('帮我写一份周报')).toBe('帮我写一份周报')
  })

  it('从旧脚手架串里只取出用户原文', () => {
    const extracted = extractUserInput(LEGACY_PAYLOAD)

    expect(extracted).toBe('帮我做一次大厂迎新活动的活动策划')
    for (const forbidden of ['会话模式', '审批模式', '已 @ Agent', '当前上下文']) {
      expect(extracted).not.toContain(forbidden)
    }
  })

  it('把背景素材与用户原文分开摆放，并声明背景不得复述', () => {
    const message = buildEnhanceUserMessage('帮我做一次迎新活动策划', {
      participants: ['营销总策划', '活动执行'],
      attachments: ['门店清单.xlsx'],
      planRevision: true,
    })

    expect(message).toContain('【用户原始输入】\n帮我做一次迎新活动策划')
    expect(message).toContain('【背景素材】')
    expect(message).toContain('营销总策划')
    expect(message).toContain('不要')
    expect(message).toContain('忽略')
  })

  it('没有背景时不产生空的背景段落', () => {
    const message = buildEnhanceUserMessage('帮我写一份周报', undefined)

    expect(message).not.toContain('【背景素材】')
  })
})

describe('prompt enhance - 输出净化', () => {
  it('去掉整体代码围栏', () => {
    expect(sanitizeEnhancedPrompt('```markdown\n帮我写一份周报\n```')).toBe('帮我写一份周报')
  })

  it('删掉脚手架标题与内部规则行，保留用户内容', () => {
    const sanitized = sanitizeEnhancedPrompt(LEGACY_ECHO)

    expect(sanitized).toContain('帮我做一次大厂迎新活动的活动策划')
    for (const forbidden of FORBIDDEN_IN_OUTPUT) {
      expect(sanitized).not.toContain(forbidden)
    }
  })

  it('去掉「以下是优化后的提示词」这类引导语与自述式收尾', () => {
    const sanitized = sanitizeEnhancedPrompt(
      ['以下是优化后的提示词：', '写一篇活动策划。', '', '如需调整语气可以直接告诉我。'].join('\n'),
    )

    expect(sanitized).toBe('写一篇活动策划。')
  })

  it('保留模型自己写的自然小标题', () => {
    const sanitized = sanitizeEnhancedPrompt(['## 目标', '把迎新活动策划落地。'].join('\n'))

    expect(sanitized).toContain('## 目标')
  })

  it('识别「把请求串抄回来」的无效产出', () => {
    expect(isScaffoldEcho(LEGACY_ECHO)).toBe(true)
    expect(isScaffoldEcho('把迎新活动拆成三步，先定人群再定玩法。')).toBe(false)
  })
})

describe('prompt enhance - 本地兜底', () => {
  it('简单任务不扩写：原文 + 一句执行说明', () => {
    const result = buildFallbackEnhancedPrompt('今天天气怎么样？')

    expect(result.startsWith('今天天气怎么样？')).toBe(true)
    expect(result).toContain('信息不足处按最合理的方式处理')
    // 只补一句，不做结构堆砌
    expect(result.split('\n\n').length).toBeLessThanOrEqual(3)
    expect(result.length).toBeLessThan(120)
  })

  it('复杂任务才补结构，且占位不超过 3 条', () => {
    const long =
      '帮我做一次大厂迎新活动的活动策划，需要覆盖签到、暖场、老板致辞、互动游戏、抽奖和收尾合影，' +
      '场地在园区多功能厅，参与人数大概 120 人，希望整体氛围年轻、有仪式感，也要照顾到远程同事看直播。'
    const result = buildFallbackEnhancedPrompt(long)
    const placeholders = result.split('\n').filter((line) => line.trim().startsWith('- '))

    expect(placeholders.length).toBeGreaterThan(0)
    expect(placeholders.length).toBeLessThanOrEqual(3)
    expect(result).not.toContain('## ')
  })

  it('兜底同样不带系统上下文、不带内部规则', () => {
    // 即使传入的是旧脚手架串（内含会话模式/审批模式），兜底也只应输出用户原文
    const result = buildFallbackEnhancedPrompt(LEGACY_PAYLOAD)

    for (const forbidden of FORBIDDEN_IN_OUTPUT) {
      expect(result).not.toContain(forbidden)
    }
    expect(result).toContain('帮我做一次大厂迎新活动的活动策划')
  })

  it('不编造事实：除原文外只允许白名单句式', () => {
    const source = '给公司新上线的报销系统写一篇内部推广文案'
    const result = buildFallbackEnhancedPrompt(source)
    const extraLines = result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !source.includes(line.replace(/^-\s*/, '').split('：')[0]))

    const allowed = [
      '补充信息(原文未提及,可直接替换):',
      '受众:(待补充:给谁看、希望他们看完做什么)',
      '渠道与形式:(待补充:发在哪个平台、什么体裁)',
      '篇幅:(待补充:字数或时长)',
      '信息不足处按最合理的方式处理,并在结果里用一句话说明所做的假设。',
    ]
    for (const line of extraLines) {
      expect(allowed).toContain(line.replace(/^-\s*/, ''))
    }
  })

  it('长度跟着复杂度走，不是单纯变长', () => {
    const simple = buildFallbackEnhancedPrompt('帮我把这段英文翻译成中文')
    const complex = buildFallbackEnhancedPrompt(
      '帮我做一次大厂迎新活动的活动策划，需要覆盖签到、暖场、老板致辞、互动游戏、抽奖和收尾合影，' +
        '场地在园区多功能厅，参与人数大概 120 人，希望整体氛围年轻、有仪式感。',
    )

    expect(simple.length).toBeLessThan(complex.length)
  })

  it('空输入返回空串', () => {
    expect(buildFallbackEnhancedPrompt('   ')).toBe('')
  })
})

describe('prompt enhance - 主入口裁决', () => {
  it('模型产出正常时采用模型结果并净化', () => {
    const { text, source } = resolveEnhancedPrompt({
      rawPrompt: '帮我写周报',
      modelOutput: '帮我写一份本周工作周报，列出已完成、进行中和下周计划三部分。',
    })

    expect(source).toBe('model')
    expect(text).toContain('本周工作周报')
  })

  it('模型把请求串抄回来时改走兜底，而不是把脚手架当结果', () => {
    const { text, source } = resolveEnhancedPrompt({ rawPrompt: '帮我写周报', modelOutput: LEGACY_ECHO })

    expect(source).toBe('fallback')
    for (const forbidden of FORBIDDEN_IN_OUTPUT) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('模型无产出时走兜底', () => {
    const { text, source } = resolveEnhancedPrompt({ rawPrompt: '帮我写周报', modelOutput: null })

    expect(source).toBe('fallback')
    expect(text).toContain('帮我写周报')
  })
})

describe('prompt enhance - 系统提示词回归守卫', () => {
  it('守住「不编造 / 不泄漏上下文 / 长度自适应」几条硬约束', () => {
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('不要编造')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('占位')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('写入审批模式')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('场景分类')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('只输出提示词本身')
  })

  it('明确把生成流程标为内部规则、禁止写进输出', () => {
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('禁止写进输出')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).toContain('不是给用户的任务')
  })

  it('提示词本身不得包含旧的固定模板痕迹', () => {
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).not.toContain('## 任务要求')
    expect(PROMPT_ENHANCE_SYSTEM_PROMPT).not.toContain('请根据以下原始需求完成任务')
  })
})
