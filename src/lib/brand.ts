/**
 * 品牌唯一真源 —— 产品名 / 副标题只在这里定义，界面文案一律 import 本文件。
 *
 * 改名时除了本文件，还需要同步这几个**无法 import 本文件**的独立构建目标（各自硬编码）：
 *   - `electron/main.ts`（主进程单独打包，不参与 Next.js 构建）
 *   - `apps/mobile/*`（独立 workspace 包）
 *   - `package.json` 的 electron-builder `productName`
 *
 * ⚠️ 注意区分：`.agenthub-data/`、`AGENTHUB_*`、`agenthub`（MCP server 名）等**小写/全大写
 * 内部标识**与品牌无关，永远不要跟着品牌一起改，改了会破坏数据目录与工具名。
 */
export const BRAND_NAME = 'Multi-Agent TeamFlow'

/** 英文副标题：Logo 区 / 首页 / 关于 用 */
export const BRAND_TAGLINE_EN = 'Multi-Agent Collaboration & Workflow'

/** 中文产品定位 */
export const BRAND_TAGLINE_ZH = '多 Agent 团队协作工作流'
