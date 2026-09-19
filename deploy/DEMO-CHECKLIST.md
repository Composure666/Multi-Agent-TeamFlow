# 答辩 / 参赛演示清单 —— Multi-Agent TeamFlow

> 面向「上台演示」场景。部署细节见 `RUNBOOK.md`，这里只讲**怎么不出事**。

---

## 一、访问信息（抄在纸上 / 放 PPT 第一页）

| 项 | 值 |
|---|---|
| 网址 | **http://101.42.94.222/** |
| 用户名 | `admin` |
| 密码 | `Qi5t4ouFYo` |

> 换密码：`sudo htpasswd /etc/nginx/.htpasswd admin`

---

## 二、关于域名：**不要折腾**（结论已定）

`nexora-studio.com` 这条路走不通，原因三条，每条都是硬的：

1. **不是你的域名** —— RDAP 查到它 2025-01-16 由 DNSPod 注册、2027-01 到期，当前解析到 `43.138.28.230`（另一台腾讯云机器，上面跑着 HTTPS 服务）。你改不了解析。
2. **北京节点必须备案** —— 服务器在 `ap-beijing`。按工信部规定，未备案域名访问 80 端口会被腾讯云拦截（会看到"该网站未备案"）。**现在用 IP 能访问，就是因为纯 IP 不需要备案。**
3. **备案要 1~3 周** —— 新买域名 + 提交材料 + 腾讯初审 1-2 天 + 管局审核 3-20 个工作日。答辩等不起。

**答辩评委看的是产品能力，不是 URL。** 继续用 IP，把省下的两周花在打磨演示上。

> 如果你**之后**想长期运营，那时再买域名 + 备案 + 上 HTTPS（`nginx-agenthub.conf` 底部已经预留了 443 配置模板）。

---

## 三、鉴权：保留，但你已经有了三种模式

**关掉鉴权的真实代价**：这个应用**自身没有任何登录体系**（我核对过环境变量和代码，只有 OSS 密钥，没有 AUTH/PASSWORD/LOGIN）。而它的核心功能之一是 `node-pty` 终端 ——

> **关掉鉴权 = 任何打开这个网址的人，都能在你服务器上执行命令。** 能装挖矿、能读走 `/etc/agenthub/agenthub.env` 里全部密钥、能删库。

所以别长期关。但你有三种可控的做法：

### 模式 A · 给评委单独开账号（**最推荐**）

```bash
sudo bash /opt/agenthub/src/deploy/auth-toggle.sh adduser judge Demo2026
```

- 评委用 `judge` / `Demo2026` 进去，**你的 admin 密码不受影响**
- 答辩结束删掉：`sudo bash /opt/agenthub/src/deploy/auth-toggle.sh deluser judge`
- 零暴露风险，还能体现"多账号权限管理"

### 模式 B · 临时关闭 + 到点自动恢复

```bash
sudo bash /opt/agenthub/src/deploy/auth-toggle.sh off 2h      # 2 小时后自动恢复
sudo bash /opt/agenthub/src/deploy/auth-toggle.sh off 30m     # 只关 30 分钟
```

- 关闭后**完全不弹框**，评委直接进
- **到点自动恢复**（脚本里挂了定时器，就算你忘了开回来也没事）
- 代价：这段时间内任何扫到这个公网 IP 的人都能进
- 提前恢复：`sudo bash /opt/agenthub/src/deploy/auth-toggle.sh on`

### 模式 C · 查状态

```bash
sudo bash /opt/agenthub/src/deploy/auth-toggle.sh status
```

会显示当前是否关闭、**还剩多少秒自动恢复**、有哪些可用账号。

> **已实测**：`off 1m` → 公网立刻变 200；60 秒后自动变回 401。缩进/配置无副作用。

---

## 四、上台前 10 分钟检查清单

按顺序跑，每条都该有预期输出：

```bash
# 1. 服务活着吗
sudo systemctl is-active agenthub nginx          # 期望：active / active

# 2. 应用本机通不通
curl -s -o /dev/null -w '%{http_code}\n' -u admin:Qi5t4ouFYo http://127.0.0.1:3000/
                                                 # 期望：200

# 3. 公网入口对不对（在你自己电脑上开浏览器更直观）
#    打开 http://101.42.94.222/  → 应弹鉴权框 → 输密码 → 看到 Multi-Agent TeamFlow

# 4. 有没有报错
sudo wc -c /var/log/agenthub/err.log             # 期望：0

# 5. 内存够不够（跑 Agent 时每进程 +200~500MB）
free -h                                          # 期望：available ≥ 800Mi

# 6. 鉴权状态确认
sudo bash /opt/agenthub/src/deploy/auth-toggle.sh status
```

**演示前务必自己跑一遍你要演示的那个流程**（尤其是生图——它慢，而且依赖外部网关）。

---

## 五、建议的演示动线（按亮点排序）

| 顺序 | 展示什么 | 为什么有说服力 |
|---|---|---|
| 1 | **多 Agent 团队协作** —— 打开「光影造像工坊」群聊，发一个需求 | 展示"需求拆解 → 分工 → 执行 → 交付"的完整闭环，这是 Multi-Agent TeamFlow 的核心差异 |
| 2 | **运行调试面板** —— 点开某条 run 的三栏详情 | 实时看到 Agent 的思考、工具调用、终端输出。**这是最震撼的一屏**，能证明"不是套壳" |
| 3 | **经验资产** —— 打开经验库，展示自动提炼出的经验 | 说明系统会从每次执行中学习，越用越强。差异化亮点 |
| 4 | **产物库** —— 展示已生成的图片 + 提示词复现记录 | 有实物、可追溯（提示词/模型/参数都记录了） |
| 5 | **能力中心 / 自动化工作台** —— 展示技能与定时任务 | 证明可扩展性与工程完整度 |
| 6 | **数据概览** —— 运行趋势 / Agent 分布 | 收尾，展示可观测性 |

> 生图演示**放在最后**或**提前生成好**：外部网关出图要几十秒到几分钟，现场等会冷场。产物库里已经有 7 张成品可以直接展示。

---

## 六、兜底方案（万一现场翻车）

| 故障 | 现场处置 |
|---|---|
| 公网打不开 | 检查 `sudo systemctl restart nginx agenthub`；确认你所在网络没被墙 |
| 拒绝访问 / 一直弹框 | 密码输错了几次？浏览器清一下缓存，或用无痕窗口 |
| **浏览器不自动填密码了 / 又弹一次框** | 2026-09-17 改过 Basic realm（就是弹框标题，`AgentHub` → `Multi-Agent TeamFlow`）。浏览器保存的 Basic 凭据是**按 realm 缓存**的，realm 一变旧凭据就不再自动带上 ⇒ **重新输一次密码即可**，属预期，不是配置坏了 |
| Agent 一直转圈 | 多半是 LLM 网关慢。先切到已完成的产物/经验页面继续讲 |
| **完全没网 / 服务器挂了** | **提前准备录屏**。这是最稳的兜底，强烈建议录一份 3 分钟演示视频 |
| 担心被搞坏 | 答辩前在腾讯云控制台**创建一个实例快照**，出事能回滚 |

---

## 七、已实测通过的能力（可以放心演示）

| 能力 | 实测结果 |
|---|---|
| **AI 对话** | ✅ 发消息 → Agent 返回，`run` 状态 `complete`，**耗时 642ms**（DeepSeek） |
| **多 Agent 协作** | ✅ 「光影造像工坊」团队跑通，成员分工正常 |
| **生图 + OSS 上传** | ✅ 已生成 7 张 2.1MB 成图，产物 URL 已上 OSS: `nexora-studio.oss-cn-beijing.aliyuncs.com` |
| **产物库** | ✅ 8 条产物（image + document），提示词/模型/参数可复现 |
| **经验资产** | ✅ 1 条已提炼经验，统计接口正常 |
| **技能系统** | ✅ 9 个技能已加载（finesse-brief / finesse-skill / frame-smith 等） |
| **自动化** | ✅ 5 个自动化任务 |
| **数据库 / 服务稳定性** | ✅ 服务自 20:13 持续运行，`err.log` **0 字节** |
| **资源余量** | ✅ 磁盘用 12G/50G，内存 available 1.4Gi，swap 4G 几乎没用 |

---

## 八、已知限制（答辩时别踩）

1. **只有 DeepSeek 配了 key** —— `anthropic` / `openai` / `ark` 都是空的。**别现场演示 Claude/GPT**，会直接报 `未配置 API Key`。要演示就选 DeepSeek 系模型。
2. **生图走的是第三方网关**（`fast.qianxing.us.ci` 的 `gpt-image-2`），不是内置能力。网关挂了就出不了图 —— **所以提前生成好**。
3. **这个服务会给访问者一个服务器 shell**（终端功能）。演示时别让评委随机敲命令。
4. **Electron 桌面端功能在服务器上没有** —— 系统托盘、本地文件直读、companion 推送都没有。如果 PPT 里讲了这些，说明"桌面端可用、Web 端功能略有差异"。
5. **手机端 API**（`/api/mobile/*`）需要 companion 代理 + Bearer token，默认没开。演示移动端要另外配。

---

## 九、常用运维命令

```bash
sudo systemctl status agenthub          # 服务状态
sudo systemctl restart agenthub         # 重启应用
sudo systemctl restart nginx            # 重启反代
sudo tail -f /var/log/agenthub/out.log  # 实时主日志
sudo tail -f /var/log/agenthub/err.log  # 错误日志（正常应为空）
sudo du -sh /opt/agenthub/data          # 数据量（会随产物增长）
```

**更新代码后重新部署**（本地 → 服务器）：

```powershell
# 本地一条命令：打包 + 上传
powershell -ExecutionPolicy Bypass -File deploy\00-pack-upload.ps1
```

```bash
# 服务器上
cd /opt/agenthub && sudo tar -xzf /root/agenthub-src.tar.gz -C src
sudo -iu agenthub
cd /opt/agenthub/src && SKIP_GIT=1 bash deploy/02-deploy.sh   # 构建约 1.5 分钟
exit
sudo systemctl restart agenthub
```
