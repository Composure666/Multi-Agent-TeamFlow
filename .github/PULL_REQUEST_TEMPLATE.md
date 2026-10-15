## 这个 PR 做了什么

<!-- 一句话说清改动；如果解决的是某个 issue，写 `Closes #123`。 -->

## 改动类型

- [ ] 新功能
- [ ] 缺陷修复
- [ ] 重构 / 技术债（对使用者无可见变化）
- [ ] 文档
- [ ] 构建 / CI / 部署

## 自测清单

通用（本地跑过再提，别让 CI 替你发现）：

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm exec tsc -p electron/tsconfig.json --noEmit` 通过（**改了 `electron/` 下任何文件才需要**，但根 tsconfig 把 `electron/` 排除了，所以别指望 `pnpm typecheck` 能兜住它）
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 无**新增**失败（当前基线有 5 条既存失败，见 `.github/workflows/ci.yml` 注释）
- [ ] `pnpm build` 通过（**改动涉及页面/路由时必跑**）

按改动类型追加：

- [ ] 改了 UI：亮色 + 深色两种主题都看过（含 hover / 选中态）
- [ ] 改了公开页 `/home` 或 `src/components/home/**`：确认没有新增指向受保护路径（`/`、`/api/*`）的链接或请求 —— 匿名访客点下去会弹原生 Basic 登录框，那是模态窗口，会把整页输入吞掉
- [ ] 新增了 `app_settings` 字段：`schema.ts` / `bootstrap.ts`（DDL 与 `safeAlter`）/ `api/settings/route.ts` 的 zod / `settings-service.ts`（`EMPTY`·`AppSettingsPatch`·`onConflictDoUpdate`）/ `normalize()` 类型分支 —— **漏任何一处都不报错、只是不生效**
- [ ] 新增了从配置推导出来的对外地址：确认它在**运行时**求值（页面若被构建期预渲染成静态 HTML，那个值会被固化成构建身份看到的结果）

## 截图 / 录屏

<!-- UI 改动请附上改动前后对比；纯逻辑改动可删掉这一节。 -->

## 没有提交进来的东西

<!-- 确认这些不在改动里：`.env*`、API Key / OSS 密钥、数据库文件、`.agenthub-data/`、`release/` 下的安装包。 -->
