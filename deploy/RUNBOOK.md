# Multi-Agent TeamFlow 部署手册 — 腾讯云轻量 `<SERVER_IP>`

> 这份是**可复制粘贴**的执行清单，配合同目录的脚本使用。
> 背景与设计取舍见 `README.md`；这里只讲"现在这一步敲什么"。

---

## 一、这台机器的实测状态（我探测过）

| 端口 | 结果 | 解读 |
|---|---|---|
| **22 (SSH)** | **OPEN** ✓ | 能连，一切从这里开始 |
| **80 (HTTP)** | **Connection refused** | ⚠️ 好消息：云安全组**已经放行 80**（包到了主机才回 RST），只是还没有服务在监听。所以**步骤 0 不用做** |
| 443 (HTTPS) | 被丢弃 | 安全组没放行。要 HTTPS 再去控制台加（需要域名） |
| 3000 / 60646 | 被丢弃 | 正确状态，服务不该裸奔公网 |

---

## 二、关于「先 `git clone` 再跑脚本」这条路 ⚠️

`README.md` 里写的「先 `git clone` 再跑脚本」在这台机器上跑不通。当初有两个原因，**第 ① 条已经解决，第 ② 条仍然成立**：

**① 仓库此前是私有的 —— 此条已解除。**
`https://gitee.com/Composure666/Multi-Agent-TeamFlow.git` 现已是**公开仓库**，匿名即可读取，`git clone` 不再需要凭据，也不会卡在 `Username for 'https://gitee.com':`。

**② 线上 `/opt/agenthub/src` 不是 git 仓库 —— 此条仍然成立。**
服务器上那份代码不是通过 `git pull` 更新的，所以 `02-deploy.sh` 里那条 `git fetch --depth=1` 分支在线上**永远走不到**。

**解决办法（本手册采用）：把源码打包直接上传，构建时用 `SKIP_GIT=1` 跳过 git。**
我已经帮你打好包并逐文件校验过了，见下一节。

---

## 三、版本对齐情况

| ref | SHA | 说明 |
|---|---|---|
| 本地 `HEAD` / `master` | **`ee78ee0`** | `chore: 忽略本地开发日志 agenthub-dev.log`（2026-09-15 16:56） |
| 远程 `gitee/master` | **`ee78ee0`** | ✅ **与本地完全一致** |
| 本地 `dev_he` | `ee78ee0` | 领先远程 `dev_he`（`6c01db4`）11 个 commit |
| 远程 `gitee/dev-he` | `858c3ab` | 3 天前的老 backup 分支，不用管 |

> 顺带纠正：3 天前那次对比得出的 `8fe524c` 是当时的 SHA；这两天你又提交了，现在 master 是 `ee78ee0`。
> 部署包 = 你本地 master `ee78ee0` 的工作区内容。

---

## 四、部署步骤

### 步骤 0 · 先解决「登录用户不是 root」

腾讯云 **Ubuntu 镜像默认登录用户是 `ubuntu`**，网页终端进去后提示符是：

```
ubuntu@VM-0-9-ubuntu:~$
```

这是 Ubuntu 的默认安全设计，**不是出错**。但后面几步都要求 root，先提权：

```bash
sudo -i          # 提示符变成 root@VM-0-9-ubuntu:~# 即可
# 若 sudo 不可用：
su -             # 输 root 密码
```

**10 秒自查**（在 ubuntu 提示符下）：

```bash
id
sudo -n true 2>/dev/null && echo 'sudo: 免密可用' || echo 'sudo: 需要密码'
```

> 我实测过这台机器：**`root` 与 `ubuntu` 两个账号都允许密码登录**（`ssh` 返回 `Permission denied (publickey,password)`）。
> 所以 scp 用哪个用户都行 —— 用 `root@` 能保持下面的路径不变；用 `ubuntu@` 就需要改上传目录（见步骤 1 的注）。
>
> 两条路都进不去 root → 控制台「更多 ▾ → 重置密码」重设，**重启**实例后重试。

---

### 步骤 1 · 本地：上传源码包（8.8 MB）

在 **PowerShell** 里跑（`scp` 是 Windows 自带的）：

```powershell
scp -o StrictHostKeyChecking=accept-new "C:\Users\he\Documents\agenthub-deploy\agenthub-src.tar.gz" root@<SERVER_IP>:/root/
```

首次连接会问 `Are you sure you want to continue connecting (yes/no)?` → 输 `yes`，然后输服务器密码。

> ⚠️ **密码提示处无回显**（连 `*` 都没有，光标也不动），这是正常的。
> ⚠️ 若敲键盘完全没反应：Windows OpenSSH 要密码时会把控制台切进裸模式，**输入法的按键送不进去**。
> 解法是用**粘贴**代替打字 —— 记事本里打出密码 → `Ctrl+C` → 终端里**右键**或 `Ctrl+Shift+V` 粘贴 → 回车。
> 更彻底：配 SSH 密钥免密（见 `CLICK-DEPLOY.html` 的「方式 B 的密钥版」）。
>
> **只记得 ubuntu 密码时**：把 `root@` 换成 `ubuntu@`，路径 `:/root/` 换成 `:/tmp/`，
> 再到服务器 root 提示符下 `mv /tmp/agenthub-src.tar.gz /root/`。

包内容：788 个源文件，14 个顶层目录，**不含** `node_modules` / `.next` / `release` / `.agenthub-data` / `.git` / `.env.local`。

---

### 步骤 2 · 服务器：解压 + 初始化（约 3–6 分钟）

```bash
ssh root@<SERVER_IP>

# 解压到 /opt/agenthub/src（顺序很重要：先解压，01 脚本稍后会把整个 /opt/agenthub 的属主改成 agenthub）
mkdir -p /opt/agenthub/src
tar -xzf /root/agenthub-src.tar.gz -C /opt/agenthub/src
ls /opt/agenthub/src | head

# 初始化：4GB swap + Node 22.22.2 + pnpm 11 + 编译工具链 + agenthub 用户 + Nginx
bash /opt/agenthub/src/deploy/01-server-init.sh
```

**这步的验收标准：** 输出里出现

```
swap        4.0Gi
```

看到 `4.0Gi` 才算过 —— 没有这 4G swap，2 核 2G 上 `next build` **必然 OOM**。

> 这一步做完了才会创建 `agenthub` 用户和 `/etc/agenthub` 目录，步骤 3 依赖它们。

---

### 步骤 3 · 传密钥文件（关键，别跳过）

服务器上运行时**必须**有 `DEEPSEEK_API_KEY` 与 4 个 `OSS_*`（共 5 项）。
`DEEPSEEK_API_KEY` 同时也是 cc adapter 的凭据来源 —— 平台把供应商中心的 `anthropic` 行指向
`https://api.deepseek.com/anthropic` 并复用同一个 DeepSeek key。⚠️ 这一行存在**数据库**里、
不走 env，所以新装实例要在供应商中心手工配一次，光传 env 不够。

你本地 `.env.local` 里其实是这 7 项，多出 `ORCHESTRATOR_PROVIDER` / `ORCHESTRATOR_MODEL_ID` ——
但**这两项在代码里没有任何读取点**（全仓 grep 命中 0 处；见 `.env.example` 注释），
传上去不生效、留着也无害。直接整份传最省事：

```powershell
# 回到本地 PowerShell，先 cd 到仓库根（路径不写死，换目录名/换机器都不用改）
# root 无公钥，用 ubuntu + 免密 sudo（先传 /tmp 再 sudo 落位）
scp -i "$env:USERPROFILE\.ssh\deploy_key" -o IdentitiesOnly=yes ".\.env.local" ubuntu@<SERVER_IP>:/tmp/agenthub.env
ssh -i "$env:USERPROFILE\.ssh\deploy_key" ubuntu@<SERVER_IP> "sudo -n install -m 600 -o root -g root /tmp/agenthub.env /etc/agenthub/agenthub.env"
rm -f /tmp/agenthub.env  # 别让明文 key 留在服务器 /tmp
```

```bash
# 回到服务器（root）
chmod 600 /etc/agenthub/agenthub.env
wc -l /etc/agenthub/agenthub.env          # 应该有 10 行左右
awk -F= '/^[A-Z]/{print $1}' /etc/agenthub/agenthub.env   # 只打印键名，核对齐不齐
```

`03-install-service.sh` 会加载它（systemd `EnvironmentFile=-/etc/agenthub/agenthub.env`），
并且发现文件已存在会**保持不动**——所以先传好，别让脚本生成空模板。

> 如果不想传 `.env.local`，也可以手工建：`mkdir -p /etc/agenthub && nano /etc/agenthub/agenthub.env`。

---

### 步骤 4 · 服务器：构建（**20–40 分钟**，全程跑 swap）

强烈建议用 `tmux`，免得 SSH 一断就得重来（虽然脚本幂等，重跑要再等一遍）：

```bash
apt-get install -y tmux

sudo -iu agenthub
tmux new -s build

cd /opt/agenthub/src
SKIP_GIT=1 bash deploy/02-deploy.sh
```

想实时盯内存，**另开一个 SSH 窗口**：

```bash
watch -n2 'free -h; echo; df -h /'
```

看到 swap 用量涨起来是**正常的**。构建脚本会：
1. `SKIP_GIT=1` → 跳过 git，直接用上传的源码
2. `pnpm install`，跳过 electron / playwright 二进制下载（省 ~400MB），排除 `apps/mobile`
3. 校验 `better-sqlite3` / `node-pty` 在系统 Node 下能加载
4. `next build`（**直接用系统 Node**，绕开需要 Electron 的 `pnpm build`）
5. 组装 standalone：拷 `static` / `public` / `skills`，把 `.agenthub-data` 软链到 `/opt/agenthub/data`

tmux 里 `Ctrl+B` 然后 `D` 脱离；`tmux attach -t build` 回去看。

**不想用 tmux 的后台跑法：**

```bash
sudo -iu agenthub bash -lc 'cd /opt/agenthub/src && SKIP_GIT=1 nohup bash deploy/02-deploy.sh > /tmp/build.log 2>&1 &'
tail -f /tmp/build.log      # Ctrl+C 只是停止看日志，构建继续
```

构建日志结尾会打印：

```
============================ 构建完成 ============================
  commit        （源码为上传包，无 git 元数据）
  运行入口      /opt/agenthub/src/.next/standalone/server.js
```

---

### 步骤 5 · 服务器：装服务并启动（1 分钟）

```bash
# 如果还在 agenthub 用户里，先 exit
exit
sudo bash /opt/agenthub/src/deploy/03-install-service.sh
```

脚本会装 systemd 服务（开机自启）、配 Nginx 反代、**生成 Basic 鉴权账号并只打印一次**：

```
┌──────────────────────────────────────────────────────────┐
│  你的访问账号（只显示这一次，请立刻记下来）              │
│     用户名 / 密码：  admin / xxxxxxxxxx                  │
└──────────────────────────────────────────────────────────┘
```

**⚠️ 立刻记下来。** 忘了就 `sudo htpasswd /etc/nginx/.htpasswd admin` 重设。

---

### 步骤 6 · 验收

```bash
systemctl status agenthub --no-pager       # 期望 active (running)
curl -I http://127.0.0.1:3000/             # 期望 200 / 307
curl -I http://127.0.0.1/                  # 期望 401（Basic 鉴权生效，正常）
tail -n 50 /var/log/agenthub/err.log       # 期望没有报错
```

然后浏览器打开 **http://<SERVER_IP>/** ，输入步骤 5 打印的账号密码。

---

## 五、以后更新代码

> **⚠️ 免密登录用 `ubuntu`，不是 `root`**（2026-09-16 实地确认）：`~/.ssh/deploy_key`
> 的公钥只装在 `ubuntu` 的 `authorized_keys` 里，**root 没装公钥**，`root@` 会
> `Permission denied (publickey,password)`。`ubuntu` 有免密 sudo，所有特权步骤加 `sudo -n`。
> 因此 `00-pack-upload.ps1` 的默认值是 `-User ubuntu`，包上传到 `/tmp/`（ubuntu 无权重写 `/root`）。

改完代码后，两条命令搞定（**本地，先 cd 到仓库根**）：

```powershell
powershell -ExecutionPolicy Bypass -File "deploy\00-pack-upload.ps1" -RemoteExtract
```

它会：打包（自动排除大目录和 `.env.local`，并校验没混进禁忌项）→ `scp` 上传 → 远端解压到 `/opt/agenthub/src`。

然后**服务器**上重新构建 + 重启：

```bash
sudo -iu agenthub bash -lc 'cd /opt/agenthub/src && SKIP_GIT=1 bash deploy/02-deploy.sh'
sudo systemctl restart agenthub
```

`02-deploy.sh` 是幂等的，可以反复跑。数据在 `/opt/agenthub/data`，**重新构建不会丢**（standalone 里是软链）。

> **新增供应商要同时补 env**：`bootstrap` 只在 `/etc/agenthub/agenthub.env` 里存在对应 key
> 时才落供应商行。内置四个供应商对应的变量名是 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` /
> `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`）/ `ARK_API_KEY`。**只更新代码不配 key，
> 供应商不会出现，该供应商的模型分配等于没生效**。追加 key 后必须 `sudo systemctl restart agenthub`
> 才生效：
> ```bash
> printf 'ARK_API_KEY=%s\n' '<key>' | sudo -n tee -a /etc/agenthub/agenthub.env > /dev/null
> sudo -n chmod 600 /etc/agenthub/agenthub.env && sudo systemctl restart agenthub
> ```

> 只打包不上传：加 `-SkipUpload`；只想看包有多大：`-SkipUpload` 后看 `C:\Users\he\Documents\agenthub-deploy\`。

---

## 六、常见问题

**Q：构建被 OOM Killer 杀了？**
```bash
dmesg | tail -20 | grep -i 'killed process'   # 确认是 OOM
free -h                                        # 确认 swap 在
```
swap 在但还是被杀 → 把 V8 堆上限调**大**再试：
```bash
NODE_OPTIONS="--max-old-space-size=2048" SKIP_GIT=1 bash deploy/02-deploy.sh
```
（是调大。调小会让 V8 频繁 GC，反而更慢更容易挂。）

**Q：`sudo -iu agenthub` 后提示找不到 node / pnpm？**
```bash
export PATH=/usr/local/bin:$PATH
```
（Node 和 pnpm 都装在 `/usr/local/bin`，某些精简镜像的 PATH 里没有它。）

**Q：`pnpm install` 失败？**
脚本里的 `--filter "!./apps/mobile"` 若不生效会自动回退全量安装。真失败就手工跑一次看完整日志：
```bash
cd /opt/agenthub/src && pnpm install --no-frozen-lockfile
```

**Q：服务起来了但页面白屏 / 500？**
```bash
tail -50 /var/log/agenthub/err.log
```
最常见两种：`.next/static` 或 `public/` 没拷进 standalone（重跑 `02-deploy.sh`）；或者 env 没配（步骤 3 没做）。

**Q：终端面板打不开？**
`node-pty` 需要 `/dev/ptmx`。腾讯云常规 Ubuntu 镜像都有。容器化部署才会缺。

**Q：能省掉 Nginx 让服务直接监听 0.0.0.0 吗？**
能，但**别**。这个服务本质是给访问者一个服务器 shell，Basic 鉴权是唯一那道门。

---

## 七、安全须知（认真看）

**这个服务通过 `node-pty` 给访问者一个货真价实的服务器终端，不是沙箱。**

1. **Basic 鉴权不要关。** 已默认开启（`/etc/nginx/conf.d/agenthub.conf` 里的 `auth_basic`）。
2. **服务只监听 `127.0.0.1:3000`**，公网入口只有 Nginx 一层。
3. **用 `agenthub` 普通用户跑，不是 root。** service 里已配好。
4. **`/etc/agenthub/agenthub.env` 600 权限**，里面是真钱的 API Key。
5. **想更安全**：把云安全组 80 收窄成只放行你自己的 IP；或者干脆不开 80，走 SSH 隧道：
   ```bash
   ssh -i "$env:USERPROFILE\.ssh\deploy_key" -L 3000:127.0.0.1:3000 ubuntu@<SERVER_IP>
   # 本地浏览器打开 http://127.0.0.1:3000
   ```
6. 桌面端与 Web 端**是同一份 UI**，不存在「功能缩水」；唯一实质差异是 `companion-proxy`（移动端访问 `/api/mobile/*` 的代理）只在 Electron 主进程里起，纯服务器部署没有它。**系统托盘 / 本地文件直读并未实现**（Spec 12 §1 / §13 列为不做），别按「桌面端有、Web 端没有」的口径讲。


---

## 附录 · 2026-09-15 首次上线实录

实际耗时约 40 分钟（含排障）。部署路径与本文档一致，但有 4 个坑是本文档成文后才发现并修复的 —— 对应脚本已一并修正。

### 坑 1 · `apps/mobile` 只「排除安装」不够（构建中断）

```
✓ Compiled successfully in 47s
Running TypeScript ...
Failed to type check.
./apps/mobile/capacitor.config.ts:1:38
Type error: Cannot find module '@capacitor/cli'
```

原因：根 `tsconfig.json` 的 `include` 是 `**/*.ts`，覆盖了 `apps/**`。只把 `apps/mobile` 从 `pnpm install` 里排除，目录仍在磁盘上，类型检查照样扫它。

修复：构建前把整个目录**移出源码树**（`mv apps/mobile /opt/agenthub/_excluded/apps-mobile`）。见 `02-deploy.sh` [2/4]。

### 坑 2 · `sites-enabled/default` 就地改名无效（公网只见 nginx 欢迎页）

现象：`http://<IP>/` 返回 `Welcome to nginx!`，而且**不弹 Basic 鉴权**。

原因：nginx 的 include 是 `sites-enabled/*`（通配目录下所有文件）。把 `default` 改名成 `default.disabled-by-agenthub` 之后，**它照样被加载**，而它带 `listen 80 default_server`，把全部请求都抢走了。

修复：**删除那个符号链接**（真实文件仍完整保留在 `sites-available/`）。见 `03-install-service.sh` [3/4]。

### 坑 3 · pnpm 结构下 Turbopack tracing 漏包（`/api/artifacts` 返 500）

现象：`err.log` 反复出现

```
⨯ unhandledRejection: Failed to load external module ali-oss-...:
  Cannot find module '.../ali-oss@6.23.0_.../node_modules/debug/src/index.js'
```

补完 `debug` 之后又变成 `Cannot find module 'osx-release'`。

原因：`output: 'standalone'` 的文件追踪，在 pnpm 的
`.pnpm/<pkg>@<ver>_<peers>/node_modules/<pkg>/` 结构下会漏文件（`debug` 只带了 `package.json`，没带 `src/`）甚至漏整包（`osx-release`）。`ali-oss` 因此加载失败，产物接口 500。

修复：构建后把 standalone 里**缺失的包用符号链接指向源码树**。源码树的 `node_modules` 是同一次 `pnpm install` 的完整产物（版本完全一致），`.pnpm` 内部一律是相对符号链接，链过去依赖图自然闭合。见 `02-deploy.sh` [4/4]。

> 副作用：standalone 不再能脱离源码树单独搬运。本方案本来就是「在目标机上构建」，源码树始终在，因此无影响。

### 坑 4 · 读进程环境变量

`sudo tr '\0' '\n' < /proc/<pid>/environ` 会 `Permission denied` —— 重定向由当前 shell 处理，不继承 sudo。
正确写法：`sudo cat /proc/<pid>/environ | tr '\0' '\n'`。

### 实测数据（供后续参考）

| 项 | 值 |
|---|---|
| 依赖安装（冷启动） | 3 分 8 秒 / 1232 包 |
| `next build` | **1 分 37 秒**（48s 编译 + 类型检查 + 37 个静态页） |
| standalone 体积 | 272 MB |
| 服务常驻内存 | ~79 MB（RSS 127 MB） |
| 构建峰值 | swap 仅用到 ~90 MB，远未触及 OOM |
| 公网鉴权 | 无凭据 401 / 带凭据 200 |
