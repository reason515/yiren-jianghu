<div align="center">

<span style="font-size: 28px;"><strong>《一人江湖》本地 Docker 环境搭建</strong></span><br/>
<span style="font-size: 18px;">Windows 本机安装 Docker Desktop · 启用 WSL2 · 国内镜像加速 · 跑通本地数据库与 E2E</span>

</div>

---

# 1. 定位

本项目本地开发需要 PostgreSQL 与 Redis（`pnpm dev:infra` 一键起）。本文档覆盖 **Windows 本机** 从零搭建 Docker 环境的完整路径与实战踩坑，与服务器侧部署文档 `deploy/README.md`（G1，生产拓扑/Nginx/回滚）互补：

| 文档 | 场景 | 关键内容 |
| --- | --- | --- |
| 本文档 `docs/docker-local-setup.md` | 本机开发环境 | 安装/激活 WSL2/镜像加速/项目接入/故障排查 |
| `deploy/README.md` | 服务器部署（G1） | 生产 compose、Nginx 拓扑、回滚、运维命令 |

两者共享同一套国内镜像配置（`docker.m.daocloud.io`）与「应用只绑 loopback」的部署规范。

# 2. 前置检查

- Windows 10/11（WSL2 需 64 位系统，虚拟化已开启）
- Node ≥ 22（`.nvmrc` 固定）、pnpm 10
- 代码库已克隆并 `pnpm install`

确认当前 WSL 状态（未启用时会提示"没有已安装的分发版"）：

```bash
wsl --status
wsl --version   # 正常应显示 WSL 2.x 与内核版本
```

# 3. 安装 Docker Desktop（Windows）

## 3.1 下载安装器

安装器约 **625MB**（以下载源返回的 `Content-Length` 为准，勿凭感觉估计大小）。大陆直连常被限速（实测约 180KB/s），可走代理提速：

```bash
URL="https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
OUT="$LOCALAPPDATA/Temp/DockerDesktopInstaller.exe"

# 先 HEAD 拿真实大小（判断"是否下完"的唯一依据）
curl -sI "$URL" | grep -i content-length

# 断点续传 + 代理（-C - 续传；--speed-limit 低速自动断，配 --retry 重试）
curl -sSL -C - -x http://127.0.0.1:7897 \
  --retry 10 --retry-delay 5 --speed-limit 500000 --speed-time 20 \
  -o "$OUT" "$URL"

# 完成后校验：文件大小 == Content-Length，且头部为 MZ（PE 可执行）
stat -c %s "$OUT"; head -c 2 "$OUT" | od -c | head -1
```

> 实战要点：下载变慢/停滞时先看进程与大小增量，**不要凭"大概应该多大"判断进度**——本项目曾把"已下完"误判为"卡住"（实际 625,139,632 字节就是完整大小）。

## 3.2 静默安装（必须提权）

`Docker Desktop Installer.exe install --quiet --accept-license` 需要**管理员权限**：直接在非提权终端运行会静默失败（无报错、无产物）。用 PowerShell 提权启动，**会弹 UAC，必须人在屏幕前点「是」**（UAC 超时未点会被自动取消）：

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Temp\DockerDesktopInstaller.exe" `
  -ArgumentList 'install','--quiet','--accept-license' -Verb RunAs
```

验证安装产物：

```bash
ls "C:/Program Files/Docker/Docker/Docker Desktop.exe"   # GUI
"C:/Program Files/Docker/Docker/resources/bin/docker.exe" version   # CLI（客户端 29.x）
```

> 注意：`Docker Desktop.exe` 与 `docker.exe` 的位置都带空格，脚本里引用务必加引号；`cli-plugins` 下同时会装好 `docker-compose`、`docker-buildx`。

# 4. 启用 WSL2（Docker 引擎的前置）

Docker Desktop 的 WSL2 后端需要在 WSL 平台就绪后才能创建其 `docker-desktop` 虚拟机。**WSL2 未启用时引擎起不来**：Desktop 界面停在初始化，后端日志（`%LOCALAPPDATA%\Docker\log\host\`）出现 `dialing 192.168.65.7:2376 ... context canceled`，`wsl --status` 提示无发行版。

在**管理员** PowerShell/CMD 执行（同样会弹 UAC）：

```powershell
wsl --install --no-distribution   # 启用 VirtualMachinePlatform + 安装 WSL2 内核
```

> 需要重启。重启后验证：`wsl --version` 显示 `WSL 2.x` + 内核版本号即就绪。若只装平台不装发行版也可（Docker Desktop 自带 `docker-desktop` 发行版，不依赖 Ubuntu）；后续如需原生 Linux 环境（如方案 B 的 apt 直装 PG/Redis）再 `wsl --install -d Ubuntu`。

# 5. 启动与引擎就绪判定

```bash
# 启动 Docker Desktop（GUI 首次启动会初始化 WSL2 后端，1–3 分钟）
powershell -NoProfile -Command "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"

# 轮询引擎就绪：Server 字段有版本号即引擎 OK
DOCKER="C:/Program Files/Docker/Docker/resources/bin/docker.exe"
"$DOCKER" version --format '{{.Server.Version}}'   # 输出 29.x = 就绪；空/error during connect = 未就绪
```

# 6. 国内镜像加速

拉取 Docker Hub 镜像在国内经常超时。Windows Docker Desktop 的 daemon 配置在 `%USERPROFILE%\.docker\daemon.json`：

```json
{
  "registry-mirrors": ["https://docker.m.daocloud.io", "https://docker.io"]
}
```

改完必须**重启 Docker Desktop**（`taskkill //IM "Docker Desktop.exe" //F` 后重新启动），并验证：

```bash
"$DOCKER" info | grep -A3 "Registry Mirrors"
```

> 服务器端镜像配置在 `/etc/docker/daemon.json`（见 `deploy/README.md`），与本机配置互不影响；镜像地址可用性会变化，用前先 `docker pull` 验证。

# 7. 项目接入（一条龙）

```bash
cd /d/code/yiren-jianghu
cp -n .env.example .env        # 本地默认 DATABASE_URL=postgres://yiren:change-me@localhost:5432/yiren_jianghu
pnpm dev:infra                 # docker compose up：postgres + redis（首次拉镜像走加速）
docker compose ps              # 两个容器 Up (healthy)
pnpm migrate                   # 迁移 0001–0006 落到真库（脚本经 --env-file-if-exists 自动读根 .env）
DATABASE_URL=postgres://yiren:change-me@localhost:5432/yiren_jianghu \
REDIS_URL=redis://localhost:6379 pnpm test:e2e   # 真实 PG/Redis 冒烟
```

> `.env` 默认值仅本地开发；服务器用独立 `.env`（chmod 600，禁止入库）。

# 8. 故障排查表

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 安装器下载很慢/停滞 | 大陆直连限速 | 代理 + `curl -C -` 续传；先 HEAD 拿 Content-Length 判断是否下完 |
| 静默安装后找不到 Docker | 未提权，UAC 被取消 | `Start-Process -Verb RunAs` 重跑；UAC 需人在场点「是」 |
| Desktop 起不来，日志 `dialing 192.168.65.7:2376 ... canceled` | WSL2 未启用 | 管理员 `wsl --install --no-distribution` → 重启 → `wsl --version` 验证 |
| `docker version` Server 为空 | 引擎初始化中/未启动 | 确认 Desktop 进程在跑，轮询 1–3 分钟 |
| 拉镜像超时 | 未配镜像加速 | 写 `%USERPROFILE%\.docker\daemon.json` → 重启 Desktop → `docker info` 验证 |
| `pnpm migrate` 报 `SASL ... client password must be a string` | `.env` 未被加载（DATABASE_URL 缺失） | 迁移脚本已用 `--env-file-if-exists` 自动读根 `.env`；确认 `.env` 存在 |
| compose 端口占用起不来 | 本机已有 5432/6379 服务 | 改 `.env` 的 `POSTGRES_PORT`/`REDIS_PORT`（与 compose 映射同步） |

# 9. 与既有约定

- 权威文档登记见 `.cursor/rules/yjh-agents.mdc`（Cursor）与 `.pi/agent/AGENTS.md`（兼容入口）；开发命令与质量门禁见 `.cursor/skills/yjh-project-conventions`。
- 服务器侧部署、回滚、`down -v` 警示见 `deploy/README.md`。
