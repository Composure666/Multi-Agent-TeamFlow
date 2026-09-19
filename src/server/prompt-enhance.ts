import type { PromptEnhanceContext } from '@/shared/prompt-enhance'

/**
 * 「AI 提示词增强」的生成逻辑。
 *
 * ## 为什么重写
 * 旧实现的产出是「把模型当成模板填空器」:前端先拼一段带 `## 当前上下文(会话模式/审批模式/场景分类)`
 * 的请求串,系统提示词又要求模型「先判断任务类型、补充必要的背景…」,一旦模型不可用,兜底
 * `optimizePromptText()` 直接把请求串套上「## 原始需求 / ## 任务要求」脚手架吐回去 —— 用户看到的
 * 是一段带内部规则的、更长但更不可执行的系统文档,而不是能直接复制给 AI 用的提示词。
 *
 * ## 现在的分工
 * - 前端只负责分清「用户原文」与「背景素材」(见 `@/shared/prompt-enhance`);
 * - 模型(**主路径**)按意图动态决定补什么,见 {@link PROMPT_ENHANCE_SYSTEM_PROMPT};
 * - 本地兜底(**降级路径**)只拿得到用户原文,结构按任务类型动态生成,见
 *   {@link buildFallbackEnhancedPrompt} —— 从接口形状上就不可能把系统上下文漏进输出;
 * - 两道净化:{@link sanitizeEnhancedPrompt} 删掉模型可能吐出的脚手架与内部规则,
 *   {@link resolveEnhancedPrompt} 判定「模型把请求串抄回来了」时改走兜底。
 */

// ─── 系统提示词(主路径) ──────────────────────────────────────────

/**
 * 注意:这段文字是给优化器看的**内部规则**,不是给最终用户的提示词。
 * 因此它必须同时满足两条:既约束优化器行为,又不能被优化器抄进输出。
 */
export const PROMPT_ENHANCE_SYSTEM_PROMPT = `你是一名资深提示词工程师。用户会给你一段原始输入,你要把它改写成「用户可以直接复制给 AI 执行」的完整提示词。

内部思考步骤(只用于你自己判断,禁止写进输出):
1. 读懂用户到底要什么:真实意图、要交付的东西、给谁用、做到什么程度、有没有隐含场景。
2. 判断哪些关键信息缺失会真正影响结果质量 —— 不同任务类型关心的要素不同,按需判断:
   - 写作/文案类:受众、用途与渠道、篇幅、语气、必须包含或必须避开的内容
   - 分析/调研类:要回答的问题、范围与时间窗、可用数据来源、结论形态
   - 设计类:目标用户、使用场景、约束条件、交付格式
   - 代码/工程类:技术栈、运行环境、边界与异常、验收方式
   - 学习/讲解类:读者当前水平、想达到的程度、讲解形式
   - 计划/策划类:目标与衡量方式、规模或预算、时间与节奏、参与方
   (以上只是示例,不是清单;缺什么补什么,不缺就不写)
3. 只补第 2 步里真正缺失、且补上以后会改变执行方式的信息。

硬性约束:
- 不要编造原始输入里没有的事实:产品数据、品牌与公司信息、用户数据、预算金额、时间地点、政策规定等一律不得凭空生成。
- 关键信息确实缺失时,用可替换的占位写法,例如「(待补充:目标受众)」,或写成「若未指定,按…处理」的有限推断;占位和推断都必须是用户一眼能改的。
- 不要把系统信息写进输出:会话模式、会话标题、写入审批模式、场景分类、Agent 名单、附件清单、任务类型标签等,都不是任务内容。只有当它们会实际改变执行方式时(例如需要多人分工、必须基于某个附件作答),才转成一句自然的要求。
- 不要输出任何指令性/元描述文字:例如「先判断这属于哪类任务」「补充必要的背景、目标、受众」「不要加入软件开发模板」「输出一段可直接复制使用的提示词」。这些话是给你的规则,不是给用户的任务。
- 不要改变任务性质,不要把一个业务需求改写成软件工程任务,也不要给不需要技术的任务加技术方案、接口设计、测试与回滚等内容。
- 长度跟着复杂度走,宁短勿长:一句话能说清的任务保持一段(80 字以内);中等任务 100~250 字;只有确实复杂时才分节或列点,且不超过 600 字。不要为了显得完整而堆砌。

输出格式:
- 只输出提示词本身。不要解释、不要寒暄、不要写「以下是优化后的提示词」。
- 不要用代码围栏把整段内容包起来。
- 允许使用简短的小标题或列点让结构清楚,但不要套固定模板。
- 语言与用户原始输入保持一致。`

// ─── 请求解析:兼容历史上「把脚手架拼进 prompt」的旧客户端 ────────────

const SCAFFOLD_HEADING =
  /^\s*(#{1,6}\s*)?(原始需求|用户原始输入|用户原始需求|原始输入|当前上下文|任务要求|优化后的提示词|优化后提示词|增强后的提示词|增强结果)\s*[:：]?\s*$/

/** 旧客户端拼接的引导句,以及模型可能抄回来的元描述句 */
const META_LINE_PATTERNS: RegExp[] = [
  /^请(结合上下文|根据以下(原始需求|信息))(增强|改写|生成|完成)/,
  /^请根据以下原始需求完成任务/,
  /^请结合上下文增强用户提示词/,
  /^以下是(优化|增强)(后|过)的?(提示词|版本)/,
  /^(优化|增强)(后|过)的?(提示词|版本)\s*[:：]?$/,
  /先判断(这)?(属于)?哪类任务/,
  /不要(加入|套用|使用).{0,10}(软件开发)?模板/,
  /补充必要的背景、目标、受众/,
  /只有当需求明确涉及代码/,
  /输出一段可直接复制使用/,
  /^任务要求\s*[:：]?$/,
]

const DROP_SECTION_HEADINGS = /^\s*(#{1,6}\s*)?(当前上下文|任务要求|生成规则|优化规则|系统提示词)\s*[:：]?\s*$/
const KEEP_SECTION_HEADINGS = /^\s*(#{1,6}\s*)?(原始需求|用户原始输入|用户原始需求|原始输入|用户输入|原始提示词)\s*[:：]?\s*$/

function isMetaLine(line: string): boolean {
  const trimmed = line.trim().replace(/^[-*+]\s+/, '')
  // 纯占位行(如残留的 `- `)按空行处理
  return META_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * 从「可能已经被拼过脚手架」的输入里取出用户原文。
 *
 * 新客户端只会传干净原文(此时原样返回);旧客户端 / 缓存的页面会传
 * `请结合上下文增强用户提示词。\n## 当前上下文…\n## 用户原始输入\n<原文>`,
 * 这里把背景段丢掉、只留 `<原文>`,避免用户在降级路径下再次看到拼接串。
 */
export function extractUserInput(text: string): string {
  const raw = (text ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  if (!SCAFFOLD_HEADING.test(raw.split('\n').find((line) => line.trim().length > 0) ?? '')) {
    // 首行不是脚手架标题:再看是否只是第一句引导语
    const lines = raw.split('\n')
    if (lines.length > 1 && META_LINE_PATTERNS.some((p) => p.test(lines[0].trim()))) {
      const rest = lines.slice(1).join('\n').trim()
      if (rest) return extractUserInput(rest)
    }
    return raw
  }

  const lines = raw.split('\n')
  const collected: string[] = []
  let mode: 'keep' | 'drop' | null = null
  for (const line of lines) {
    if (DROP_SECTION_HEADINGS.test(line)) {
      mode = 'drop'
      continue
    }
    if (KEEP_SECTION_HEADINGS.test(line)) {
      mode = 'keep'
      continue
    }
    if (SCAFFOLD_HEADING.test(line)) {
      mode = 'drop'
      continue
    }
    if (mode === 'keep') collected.push(line)
  }
  const extracted = collected.join('\n').trim()
  return extracted || raw
}

// ─── 模型输入:把背景放成「仅供理解的素材」 ──────────────────────────

function describeParticipants(participants: string[]): string {
  return `- 参与者:${participants.join('、')}(多人协作场景,涉及分工时才需要体现)`
}

export function buildEnhanceUserMessage(prompt: string, context?: PromptEnhanceContext): string {
  const blocks: string[] = [`【用户原始输入】\n${prompt}`]

  const background: string[] = []
  if (context?.title?.trim() || context?.description?.trim() || context?.schedule?.trim()) {
    if (context.title?.trim()) background.push(`- 自动化任务标题:${context.title.trim()}`)
    if (context.description?.trim()) background.push(`- 自动化任务说明:${context.description.trim()}`)
    if (context.schedule?.trim()) background.push(`- 触发方式:${context.schedule.trim()}`)
  }
  if (context?.participants?.length) background.push(describeParticipants(context.participants))
  if (context?.attachments?.length) {
    background.push(`- 涉及附件:${context.attachments.join('、')}(任务必须基于这些文件内容时才需要体现)`)
  }
  if (context?.planRevision) {
    background.push('- 本次输入不是新任务,而是对已有执行计划的修改意见')
  }
  if (context?.quote?.trim()) background.push(`- 引用来源:${context.quote.trim()}`)

  if (background.length > 0) {
    blocks.push(
      [
        '【背景素材】仅用于理解任务真实意图与必要边界。不要在输出里复述、列举或转写这些背景;',
        '与任务无关就完全忽略;只有确实改变执行方式时,才转成一句自然的要求写进提示词。',
        ...background,
      ].join('\n'),
    )
  }

  return blocks.join('\n\n')
}

// ─── 输出净化:删掉脚手架与内部规则 ────────────────────────────────

/**
 * 模型偶尔会「照着请求的样子」输出:带上 `## 原始需求 / ## 任务要求` 脚手架,
 * 甚至把系统提示词里的规则抄进正文。这里按行做结构化清理:
 * 丢掉脚手架标题、丢掉内部规则行、去掉整体代码围栏与收尾寒暄。
 */
export function sanitizeEnhancedPrompt(raw: string): string {
  let text = (raw ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  // 整体被围栏包住 → 去掉围栏
  const fenced = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  if (fenced) text = fenced[1].trim()

  const kept: string[] = []
  let dropSection = false
  let seenContent = false

  for (const line of text.split('\n')) {
    const trimmed = line.trim()

    // 1) 脚手架标题:丢掉标题本身,内容按类型决定去留
    if (DROP_SECTION_HEADINGS.test(line)) {
      dropSection = true
      continue
    }
    if (SCAFFOLD_HEADING.test(line)) {
      // 「原始需求 / 用户原始输入」这类标题后面跟的是用户原话,保留内容;
      // 「优化后的提示词」只是换了个说法,同样保留内容。
      dropSection = false
      continue
    }
    // 2) 模型自己写的自然小标题 → 保留,并结束丢弃状态
    if (/^#{1,6}\s/.test(trimmed)) {
      dropSection = false
      kept.push(line)
      seenContent = true
      continue
    }
    if (dropSection) continue
    if (isMetaLine(line)) continue
    if (!seenContent && !trimmed) continue
    if (trimmed) seenContent = true
    kept.push(line)
  }

  const trimmedLines = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // 去掉模型自述式收尾(仅当它不是唯一内容时)
  const withoutFarewell = trimmedLines.replace(
    /\n+((?:如需|如果需要|希望(?:这|以上)|要不要我|需要我)[^\n]*)$/,
    '',
  )
  return (withoutFarewell || trimmedLines).trim()
}

/**
 * 判断模型是不是把「请求串」原样抄回来了(旧脚手架痕迹)。
 * 命中就说明这次生成没有价值,应改走本地兜底,而不是把脚手架净化后当结果给用户。
 */
export function isScaffoldEcho(raw: string): boolean {
  const text = (raw ?? '').replace(/\r\n/g, '\n')
  const markers = [
    /##\s*原始需求/,
    /##\s*用户原始输入/,
    /##\s*当前上下文/,
    /##\s*任务要求/,
    /请结合上下文增强用户提示词/,
    /请根据以下原始需求完成任务/,
  ]
  const hits = markers.filter((pattern) => pattern.test(text)).length
  return hits >= 2
}

// ─── 本地兜底:按任务类型动态补要素,不套模板、不编事实 ─────────────────

type TaskKind =
  | 'copy' // 文案 / 营销
  | 'writing' // 写作 / 文档
  | 'translate'
  | 'research' // 分析 / 调研
  | 'data' // 数据 / 表格
  | 'design' // 设计 / 原型
  | 'code' // 代码 / 工程
  | 'learning'
  | 'plan' // 计划 / 策划 / 方案
  | 'qa' // 问答 / 对话
  | 'general'

type SlotRule = {
  /** 该要素的占位文案 */
  placeholder: string
  /** 原文里已经提到该要素时不补 */
  mentioned: RegExp
}

const SLOT_RULES: Record<TaskKind, SlotRule[]> = {
  copy: [
    { placeholder: '受众:(待补充:给谁看、希望他们看完做什么)', mentioned: /受众|面向|给谁|目标人群|用户群|读者/ },
    { placeholder: '渠道与形式:(待补充:发在哪个平台、什么体裁)', mentioned: /公众号|小红书|知乎|抖音|微博|朋友圈|海报|邮件|落地页|官网|广告|渠道|平台|体裁/ },
    { placeholder: '篇幅:(待补充:字数或时长)', mentioned: /\d+\s*(字|词|句|段|条|秒|分钟)|篇幅|长度|字数/ },
  ],
  writing: [
    { placeholder: '受众:(待补充:写给谁)', mentioned: /受众|面向|给谁|读者|汇报对象/ },
    { placeholder: '篇幅与形式:(待补充:字数、是否需要大纲/表格)', mentioned: /\d+\s*(字|词|页)|篇幅|字数|大纲|表格|文档|ppt|演示/ },
  ],
  translate: [
    { placeholder: '目标语言:(待补充:译成哪种语言)', mentioned: /英文|英语|中文|汉语|日文|日语|韩文|韩语|法文|法语|德文|德语|西班牙|俄语|译成|翻译成/ },
    { placeholder: '语气风格:(待补充:正式/口语/专业术语)', mentioned: /正式|口语|书面|专业|轻松|学术|风格|语气/ },
  ],
  research: [
    { placeholder: '决策用途:(待补充:结论用来做什么决定)', mentioned: /用来|目的是|为了|决策|选型|汇报|投稿|参考/ },
    { placeholder: '范围与时间:(待补充:看哪些对象、哪个时间窗)', mentioned: /范围|20\d{2}|近\s*\d+|今年|去年|季度|年度|周期/ },
    { placeholder: '结论形式:(待补充:对比表/报告/清单)', mentioned: /表格|报告|清单|对比|结论|摘要|要点/ },
  ],
  data: [
    { placeholder: '口径与字段:(待补充:按什么口径、需要哪些字段)', mentioned: /口径|字段|指标|维度|分组/ },
    { placeholder: '输出形式:(待补充:表格/图/结论)', mentioned: /表格|图表|图|清单|结论|csv|excel/ },
  ],
  design: [
    { placeholder: '目标用户与场景:(待补充:谁在什么情况下用)', mentioned: /用户|受众|场景|使用情境|人群/ },
    { placeholder: '交付形式:(待补充:原型/线框/设计稿/说明)', mentioned: /原型|线框|设计稿|figma|页面|规范|说明/ },
  ],
  code: [
    { placeholder: '技术栈与运行环境:(待补充:语言/框架/版本)', mentioned: /react|vue|next|node|python|java|go\b|rust|typescript|ts\b|sql|docker|浏览器|windows|linux|macos/i },
    { placeholder: '验收方式:(待补充:怎么算完成)', mentioned: /测试|验收|用例|边界|兼容|性能|部署/ },
  ],
  learning: [
    { placeholder: '当前水平:(待补充:零基础还是已有经验)', mentioned: /零基础|新手|入门|没接触|熟悉|有经验|进阶|专家/ },
    { placeholder: '想达到的程度:(待补充:看懂/会用/能通过考核)', mentioned: /掌握|看懂|会用|通过|面试|考试|上手|能写/ },
  ],
  plan: [
    { placeholder: '目标与衡量方式:(待补充:做成什么样算成功)', mentioned: /目标|kpi|指标|转化|效果|衡量/i },
    { placeholder: '规模与预算:(待补充:多少人/多少预算)', mentioned: /预算|费用|成本|万元|\d+\s*(人|名|桌|场)|规模/ },
    { placeholder: '时间与节奏:(待补充:什么时候、分几步)', mentioned: /时间|日期|周期|节奏|阶段|里程碑|\d+\s*(天|周|月)/ },
  ],
  qa: [],
  general: [
    { placeholder: '输出形式:(待补充:要结论、清单还是完整文档)', mentioned: /输出|给我|列出|写成|格式|表格|清单|文档|列表/ },
  ],
}

/**
 * 只做**有限推断**的收尾要求:不编事实,信息不足时给可替换的处理方式。
 * 这句话本身是给执行者(下游 AI)的要求,不是优化规则,因此可以出现在提示词里。
 */
const EXECUTION_NOTE = '信息不足处按最合理的方式处理,并在结果里用一句话说明所做的假设。'

function classifyTask(text: string): TaskKind {
  const t = text.toLowerCase()
  const has = (pattern: RegExp) => pattern.test(t)
  // 顺序=优先级:先判特征更强的类别,避免「写一份周报」被「写」这个字拖进文案类。
  if (has(/翻译|译成|中译英|英译中|translate/)) return 'translate'
  if (has(/代码|函数|脚本|接口|bug|调试|重构|部署|报错|sql|单元测试/)) return 'code'
  if (has(/数据|表格|excel|csv|报表|统计|指标|清洗/)) return 'data'
  if (has(/原型|线框|界面|ui\b|ux\b|figma|视觉设计|落地页|小程序|页面设计/)) return 'design'
  if (has(/讲解|教我|学习|入门|教程|科普|原理|怎么理解/)) return 'learning'
  if (has(/策划|方案|规划|排期|预算|执行计划|活动/)) return 'plan'
  if (has(/调研|分析|研究|对比|选型|评估|盘点|竞品|市场|可行性/)) return 'research'
  if (has(/文档|报告|总结|周报|日报|纪要|ppt|演示文稿|白皮书|提纲|大纲/)) return 'writing'
  if (has(/文案|软文|推广|广告语|slogan|标题|推文|朋友圈|小红书|公众号|海报|宣传单|写一篇|写一段|写个|写一份/)) return 'copy'
  if (has(/[?？]\s*$/) || has(/是不是|为什么|怎么办|多少|如何|吗[?？]?$/)) return 'qa'
  return 'general'
}

function normalizeInput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 本地兜底(模型不可用时)。
 *
 * 三条纪律:
 * 1. 只用用户原文,永远不接触系统上下文(会话模式/审批模式/场景分类都不可能出现在这里);
 * 2. 只补「原文没提、且确实影响结果」的要素,按任务类型动态选取,最多 3 条,用可替换占位表示;
 * 3. 不编造任何事实,也不输出「先判断任务类型」这类内部规则。
 *
 * 简单任务因此只会得到「原文 + 一句执行说明」,不会为了显得完整而变长。
 */
export function buildFallbackEnhancedPrompt(prompt: string): string {
  const source = normalizeInput(extractUserInput(prompt))
  if (!source) return ''

  const kind = classifyTask(source)
  const missing = SLOT_RULES[kind]
    .filter((rule) => !rule.mentioned.test(source))
    .slice(0, source.length >= 40 ? 3 : 1)

  const blocks = [source]
  if (missing.length > 0) {
    blocks.push(['补充信息(原文未提及,可直接替换):', ...missing.map((rule) => `- ${rule.placeholder}`)].join('\n'))
  }
  blocks.push(EXECUTION_NOTE)
  return blocks.join('\n\n')
}

// ─── 主入口:模型产出 → 净化 → 不合格则兜底 ─────────────────────────

export function resolveEnhancedPrompt({
  rawPrompt,
  modelOutput,
}: {
  rawPrompt: string
  modelOutput: string | null
}): { text: string; source: 'model' | 'fallback' } {
  if (modelOutput && !isScaffoldEcho(modelOutput)) {
    const sanitized = sanitizeEnhancedPrompt(modelOutput)
    if (sanitized.length >= 2) return { text: sanitized, source: 'model' }
  }
  return { text: buildFallbackEnhancedPrompt(rawPrompt), source: 'fallback' }
}
