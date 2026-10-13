# Multi-Agent TeamFlow 服务器部署（腾讯云轻量 2 核 2G / Ubuntu）

一套脚本，把 Multi-Agent TeamFlow 的 **Web 服务**部署到公网服务器上，用手机或别的电脑访问。

---

## 一、先说一个必须知道的前提

**原计划（本地构建 → 把产物传到服务器）在这个项目上行不通。**

原因是本项目两个核心原生模块与「操作系统 + ABI」强绑定：

| 模块 | 作用 | 为什么不能跨平台搬 |
|---|---|---|
| `better-sqlite3` | 全部数据的 SQLite 驱动 | Windows 编出来的 `.node` 在 Linux 上是 `invalid ELF header` |
| `node-pty` | 调试面板的真实终端 | 同上，且 Windows 用的是 ConPTY，Linux 用 forkpty |

更隐蔽的一层：本地 `pnpm build` 走的是 `scripts/run-electron-node.mjs`（用 Electron 内嵌 Node 跑，为了和桌面端 ABI 一致），产物里的 binding 是 **Electron 私有 ABI 130**。就算你把它搬到 Linux，系统 Node（ABI 137）照样加载不了。

**所以唯一干净的路径是：在服务器上构建一次。** 2G 内存靠 4G swap 撑过构建，之后日常只跑不建。

> 备选路线（可选）：如果以后本地装了 Docker Desktop，可以本地 `docker build --platform linux/amd64` 出镜像，`docker save` 后传到服务器 `docker load`。这样服务器完全不用构建，但本地要装几个 GB 的 Docker，且 2G 服务器跑 Docker 会有额外开销。当前不建议。

---

## 二、实测资源占用与配置对照

| 项目 | 实测值 |
|---|---|
| 源码 + 文档 | ~100 MB |
| `node_modules`（pnpm，跳过 electron/playwright 二进制后） | ~800 MB – 1.2 GB |
| 生产构建产物 `.next` | ~200 MB |
| 运行时数据 `.agenthub-data` | 起步很小，**会持续增长**（图片/产物/上传文件） |

| 阶段 | 内存需求 |
|---|---|
| `next build` | 峰值 **2.5 – 4 GB** ⚠️ 这是 2G 机器唯一的坎 |
| 运行 Web 服务 | 300 – 800 MB |
| 每次 Agent 执行 | 再 +200 – 500 MB（起 shell + CLI 子进程） |

**结论：2 核 2G 够用，但必须满足三条**
1. **开 4GB swap** —— 否则构建 100% OOM（`01-server-init.sh` 自动做）
2. **磁盘 ≥ 40GB** —— 构建 + 依赖 + 数据增长
3. **别指望同时跑 3 个以上 Agent** —— 内存会顶到 swap，变卡

---

## 三、部署步骤

> **⚠️ 先看这条：`git clone` 这条路走不通。**
> 本仓库在 Gitee 上是**私有**的（匿名访问返回 401），服务器上 `clone` 会卡在要用户名密码；
> 而且 `deploy/` 这个目录本身**还没提交进仓库**（本地是 untracked），clone 下来根本没有这些脚本。
>
> 所以实际可执行的流程是「**本地打包 → scp 上传 → 构建时 `SKIP_GIT=1`**」：
>
> | 要什么 | 在哪 |
> |---|---|
> | 可复制粘贴的全套清单（含实测端口状态、实测 SHA） | **[`RUNBOOK.md`](./RUNBOOK.md)** |
> | 打包 + 上传一条命令 | [`00-pack-upload.ps1`](./00-pack-upload.ps1) |
> | 跳过 git、用已上传源码构建 | `SKIP_GIT=1 bash deploy/02-deploy.sh` |
>
> 下面步骤 0–5 保留为**原理说明**。走上传路线时：步骤 1 的 `git clone` 换成
> `tar -xzf /root/agenthub-src.tar.gz -C /opt/agenthub/src`（且必须**先解压**，
> `01` 脚本随后会把整个 `/opt/agenthub` chown 给 `agenthub`），步骤 3 的命令前面加 `SKIP_GIT=1`。

### 步骤 0：云控制台准备

1. 镜像选 **Ubuntu 22.04 LTS** 或 **24.04 LTS**（别选应用镜像，会抢端口抢内存）
2. **防火墙放行 TCP 80**（要 HTTPS 再放 443）—— 云安全组和服务器内防火墙是两套，都要配
3. 记下公网 IP

### 步骤 1：上传脚本并初始化（root）

如果仓库里已经有 `deploy/` 目录，直接 clone；否则先把本目录传上去。

```bash
ssh root@<你的公网IP>

# 先 clone（初始化脚本也会用这个路径）
mkdir -p /opt/agenthub && cd /opt/agenthub
git clone https://gitee.com/Composure666/Multi-Agent-TeamFlow.git src

# 跑初始化：swap + Node 22 + pnpm 11 + 编译工具链 + 用户 + Nginx
bash /opt/agenthub/src/deploy/01-server-init.sh
```

脚本会打印内存/swap 状态。**看到 `Swap: 4.0Gi` 才算过。**

### 步骤 2：填 API Key

```bash
mkdir -p /etc/agenthub
cp /opt/agenthub/src/.env.example /etc/agenthub/agenthub.env
nano /etc/agenthub/agenthub.env      # 至少填 ANTHROPIC_API_KEY
chmod 600 /etc/agenthub/agenthub.env
```

> 这一步也可以先跳过 —— 步骤 4 的脚本发现文件不存在会自动生成模板，并提醒你还没填。

### 步骤 3：构建（以 agenthub 用户）

```bash
sudo -iu agenthub
bash /opt/agenthub/src/deploy/02-deploy.sh

# 源码是 scp 上传的（不是 clone 的）→ 加上 SKIP_GIT=1，否则脚本会去 clone 私有仓库而卡住
SKIP_GIT=1 bash /opt/agenthub/src/deploy/02-deploy.sh
```

**这一步 10–30 分钟。** 想实时看内存，另开一个 SSH 窗口：

```bash
watch -n2 'free -h; echo; df -h /'
```

看到 swap 用量涨起来是正常的。构建脚本做的事：
- 浅克隆/更新代码
- `pnpm install`，**跳过 electron 与 playwright 二进制下载**（省 ~400MB），排除 `apps/mobile`
- 校验 `better-sqlite3` / `node-pty` 在当前 Node 下可加载
- `next build`（直接用系统 Node，**绕开** `run-electron-node.mjs`）
- 组装 standalone：拷 `static`、`public`、`skills`，把 `.agenthub-data` 软链到 `/opt/agenthub/data`

### 步骤 4：装服务并启动（root）

```bash
exit                                    # 退出 agenthub 用户
sudo bash /opt/agenthub/src/deploy/03-install-service.sh
```

脚本会：
- 装 systemd unit（开机自启）
- 装 Nginx 反代到 `127.0.0.1:3000`
- **生成 Basic 鉴权账号并打印一次**（务必记下来）
- 启动服务 + 健康检查

### 步骤 5：验证

```bash
systemctl status agenthub                    # active (running)
curl -I http://127.0.0.1:3000/               # 200 / 307
tail -f /var/log/agenthub/err.log            # 无报错
```

然后浏览器打开 `http://<公网IP>/`，输入步骤 4 打印的账号密码。

---

## 四、文件清单

| 文件 | 在哪跑 | 作用 |
|---|---|---|
| **`RUNBOOK.md`** | — | **可复制粘贴的部署清单**（含实测端口状态、版本对齐、FAQ） |
| **`00-pack-upload.ps1`** | 本地 Windows | 打包源码（排除大目录 / `.env.local` 并自校验）+ scp 上传 |
| `01-server-init.sh` | 服务器 root | swap、Node 22、pnpm 11、编译工具链、agenthub 用户、Nginx |
| `02-deploy.sh` | 服务器 agenthub | 取源码（或 `SKIP_GIT=1`）→ 装依赖 → 构建 → 组装 standalone（幂等） |
| `03-install-service.sh` | 服务器 root | systemd 服务 + Nginx 反代 + Basic 鉴权 + 启动（幂等） |
| `agenthub.service` | — | systemd unit 模板 |
| `nginx-agenthub.conf` | — | Nginx 站点配置（含 SSE、WebSocket、长任务超时） |

目录约定：

```
/opt/agenthub/
├── src/                                    # 源码 + 构建场所
│   └── .next/standalone/                   # ← 真正的运行目录（server.js 在此）
│       ├── server.js
│       ├── .next/static/                   # 02 脚本拷进来
│       ├── public/                         # 02 脚本拷进来
│       ├── skills/                         # 02 脚本拷进来
│       └── .agenthub-data -> /opt/agenthub/data   # 软链
└── data/                                   # 运行时数据（持久，重部署不丢）
/etc/agenthub/agenthub.env                  # API Key（600 权限）
/var/log/agenthub/{out,err}.log             # 日志
```

---

## 五、为什么脚本里有这些"多余"的步骤

留个记录，避免以后有人"优化"掉关键步骤。

| 步骤 | 不做会怎样 |
|---|---|
| `swap 4G` | `next build` 在 2G 机器上必然 OOM |
| `ELECTRON_SKIP_BINARY_DOWNLOAD=1` | 白下 269MB Electron 二进制，服务器根本用不到 |
| 排除 `apps/mobile` | 白装 Capacitor 移动端依赖 |
| 直接用 `node next build` 而非 `pnpm build` | `pnpm build` 走 Electron Node，服务器上 electron 已跳过下载 → 直接失败 |
| 拷 `public/` 和 `.next/static/` 进 standalone | Next 官方就不把这两个打进 tracing，不拷的话页面 404、样式全丢 |
| 拷 `skills/` 进 standalone | `src/server/skill-service.ts` 用 `process.cwd()/skills` 定位技能目录，而 `server.js` 开头 `process.chdir(__dirname)`，cwd 就是 standalone 目录 |
| `.agenthub-data` 做软链 | 数据会写进 `.next/standalone/` 内部，下次重新构建就**全丢** |
| Nginx `proxy_buffering off` | SSE（运行日志实时流）会被缓冲，前端卡着不出字 |
| 显式 `Environment=HOSTNAME=127.0.0.1` | systemd 默认往服务里注入机器主机名，Next 会拿它当监听地址，绑不上 |

---

## 六、常见问题

**Q：构建时 SSH 断了怎么办？**
重新连上再跑一次 `02-deploy.sh`，幂等。想彻底不怕断线，用 `tmux`：
```bash
sudo -iu agenthub
tmux new -s build
bash /opt/agenthub/src/deploy/02-deploy.sh
# Ctrl+B 然后 D 脱离；tmux attach -t build 回去看
```

**Q：构建到一半被 OOM Killer 杀了？**
```bash
dmesg | tail -20 | grep -i 'killed process'    # 确认是 OOM
free -h                                        # 看 swap 是否真的在
```
如果 swap 没生效，回头跑一遍 `01-server-init.sh`。如果 swap 生效还是被杀，把 `NODE_OPTIONS` 调大一点再试：
```bash
NODE_OPTIONS="--max-old-space-size=2048" bash /opt/agenthub/src/deploy/02-deploy.sh
```
（对，调**大**。设太小会让 V8 频繁 GC 反而更慢，且过早放弃。）

**Q：服务起来了但页面 500 / 白屏？**
```bash
tail -50 /var/log/agenthub/err.log
```
最常见的两个原因：
1. `.next/static` 或 `public/` 没拷进 standalone → 重跑 `02-deploy.sh`
2. API Key 为空 → `nano /etc/agenthub/agenthub.env` 后 `systemctl restart agenthub`

**Q：浏览器能打开但终端面板用不了？**
`node-pty` 需要 `/dev/ptmx`。腾讯云常规 Ubuntu 镜像都有。如果容器化部署才会缺。

**Q：想让服务直接监听 0.0.0.0，不用 Nginx？**
可以，但**强烈不建议** —— 见下面的安全须知。真要做就改 unit 里的 `Environment=HOSTNAME=0.0.0.0` 并放行 3000，风险自负。

**Q：HTTPS 怎么配？**
需要域名。腾讯云控制台可申请免费 SSL 证书。拿到证书后取消 `nginx-agenthub.conf` 底部的注释块，把 80 改成跳转、启用 443。没域名就用 HTTP + Basic 鉴权。

**Q：桌面端（Electron）那些功能呢？**
桌面端 = **同一份 Web UI + 一层 Electron 壳**（`electron/` 约 986 行，无业务逻辑），所以功能**不是缩水的**——服务器上跑不了的只有一样：`companion-proxy`（桌面主进程里 listen 0.0.0.0 的代理，供手机端访问 `/api/mobile/*`）。即：**移动端伴随 App 连不上纯 Web 部署，其余功能一致。**

> 注：**系统托盘 / 本地文件系统直读并未实现**。Spec 12 §1「不做」与 §13 把它列为 Phase 1 不做，`electron/` 里也搜不到 `Tray` / `globalShortcut` / `autoUpdater`。本文件此前写成「桌面端有这些、Web 端缩水」，与实现不符，已更正。

---

## 七、日常运维

```bash
# 更新代码并重新部署
sudo -iu agenthub
bash /opt/agenthub/src/deploy/02-deploy.sh     # 10–30 分钟
exit
sudo systemctl restart agenthub

# 备份数据（SQLite + 图片 + 工作区）
sudo systemctl stop agenthub
sudo tar czf ~/agenthub-data-$(date +%F).tar.gz -C /opt/agenthub/data .
sudo systemctl start agenthub

# 看资源
free -h && df -h /

# 日志
tail -f /var/log/agenthub/out.log
tail -f /var/log/agenthub/err.log
```

**磁盘告警**：`.agenthub-data` 会持续增长。`du -sh /opt/agenthub/data/*` 看看谁在涨，产物图片在 `artifact-images/`，部署产物在 `deployments/`。建议每月清一次。

---

## 八、安全须知（请认真看）

**这个服务本质上是给访问者一个服务器 shell。** `node-pty` 不是沙箱，是货真价实的终端。

所以：

1. **Basic 鉴权不要关。** `03-install-service.sh` 默认开启。想关之前先确保你用别的方式限制了访问（安全组白名单 / 只走 SSH 隧道）。
2. **服务只监听 `127.0.0.1`。** 公网入口只有 Nginx 一层，端口不裸奔。
3. **用 `agenthub` 普通用户跑，不要 root。** 已经在 service 里配好了。
4. **API Key 文件 600 权限。** 里面是你的真钱。
5. **想更安全**：安全组只放行你自己的 IP 访问 80/443。或者干脆完全不开 80，用 SSH 隧道：
   ```bash
   ssh -L 3000:127.0.0.1:3000 root@<公网IP>
   # 本地浏览器打开 http://127.0.0.1:3000
   ```
   这样公网完全看不到这个服务，最安全。
