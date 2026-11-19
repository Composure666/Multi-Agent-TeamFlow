# 任务清单 — README demo 链接 + 团队详情对话框溢出

- [x] R1 README.md：徽章行下方加 ecf4ed9 原样顶部链接；第 79 行引导语 `Live demo once deployed:` → `Live demo:`
- [x] R2 README.zh-CN.md：同上（中文原样链接）；第 79 行引导语 `部署后访问：` → `在线演示：`
- [x] R3 两处顶部链接与第 79 行逐字核对（URL 均为 http://121.40.240.236/demo）
- [x] D1 复现：1366×768 与 1920×1080 下打开多成员团队详情，实测并记录溢出量
- [x] D2 team-detail-dialog.tsx 按 create-team 同款改 grid-rows 三行结构（头行 / 滚动内容区 / 固定底部）
- [x] D3 复测：两档视口 0 溢出、底部按钮全部可见可点；截图存证
- [x] V1 tsc 0 错误；eslint（改动文件）0 错误；相关测试 + 全量 vitest
- [x] V2 写 PROGRESS.md + frontend-polish PROGRESS.md 末尾加指向；证据进 ~/workspace/frontend-polish-evidence/readme-demo-link-team-dialog/
