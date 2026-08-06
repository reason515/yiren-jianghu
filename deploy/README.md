# 部署说明（G1）

本目录的部署实践遵循内部规范《Docker Deployment Reuse Guide》（`D:\code\typhoon\docker\README.md`）：服务器复用现有主机时，应用只绑 loopback、公网入口走主机 Nginx、部署脚本文件化可审计可回滚。

## 拓扑

```text
Internet → 主机 Nginx(80/443) → 127.0.0.1:<API_PORT> → api 容器(:3000)
                                                          ├─ postgres（内网，不暴露）
                                                          └─ redis（内网，不暴露）
```

## 文件清单

```text
deploy/
  nginx.yiren-jianghu.conf   # 主机 Nginx 模板（含 WS 升级头）
  scripts/deploy-release.sh  # 服务器端发布脚本（CI 上传执行，含健康/就绪验证）
README.md
docker-compose.prod.yml      # 生产 compose（固定 project name: yiren-jianghu-prod）
.dockerignore
```

## 首次激活

1. **服务器准备**：
   ```bash
   mkdir -p /opt/yiren-jianghu && cd /opt/yiren-jianghu
   # 上传 docker-compose.prod.yml；cp .env.example .env 并填真实值
   chmod 600 .env            # secrets 只在服务器，禁止入库/打印
   ```
2. **仓库 secrets**（Settings → Secrets and variables → Actions）：
   - `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`
3. **触发部署**：`Deploy` workflow（main 推送自动 / 手动 dispatch）。
   未配置 secrets 时 SSH 步骤自动跳过，镜像构建与推送仍会执行。
4. **首次上线前先演练回滚**（见下）。

## 数据库迁移

在 api 容器内执行（devDeps 已随镜像带入）：
```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @yjh/api migrate:up
```
> 若容器内 `pnpm` 因网络无法从 registry 拉取，改用 node 直跑：
> `docker compose -f docker-compose.prod.yml exec api node node_modules/node-pg-migrate/bin/node-pg-migrate up`
> 生产迁移策略（独立迁移作业、向后兼容、回滚预案）在 G2 正式化。

## 大陆镜像加速（重要）

国内服务器拉取 Docker Hub 镜像经常超时。在服务器配置 registry 镜像：

```bash
sudo mkdir -p /etc/docker && sudo vi /etc/docker/daemon.json
```
```json
{
  "builder": { "gc": { "defaultKeepStorage": "20GB", "enabled": true } },
  "features": { "buildkit": true },
  "registry-mirrors": ["https://docker.m.daocloud.io", "https://docker.io"]
}
```
```bash
sudo systemctl daemon-reload && sudo systemctl restart docker
docker info | grep -A3 "Registry Mirrors"   # 验证
docker pull postgres:16-alpine              # 上线前预拉基础镜像
```
> 镜像地址可用性会变化，用前先验证；镜像只加速不构成信任边界。

## 回滚

```bash
cd /opt/yiren-jianghu
API_IMAGE=ghcr.io/reason515/yiren-jianghu/api:<上一可用版本> \
  docker compose -f docker-compose.prod.yml up -d api
```
应用回滚**不自动回滚数据库**；Schema 变更需单独设计向后兼容迁移与回滚策略（G2）。

## 标准运维

```bash
docker compose -f docker-compose.prod.yml ps                # 状态
docker compose -f docker-compose.prod.yml logs --tail=200   # 日志
docker compose -f docker-compose.prod.yml exec api sh       # 进容器
docker compose -f docker-compose.prod.yml up -d --force-recreate  # 改 .env 后必须用这个
sudo ss -lntp; sudo docker system df                        # 端口与磁盘
```

**禁止**：`docker compose down -v` 会删除命名卷（数据库！）；日常清理不得带 `-v`。

## 部署验证顺序（从内向外）

1. `docker compose -f docker-compose.prod.yml ps` — 容器是否 healthy
2. `docker compose ... logs --tail=200` — 启动/依赖是否失败
3. `curl 127.0.0.1:<API_PORT>/health` — 容器映射是否通
4. `curl 127.0.0.1:<API_PORT>/ready` — 依赖（PG/Redis）是否就绪
5. `curl http://<域名>/health` — Nginx 路由
6. 业务验证（登录/创建角色等一条真实链路）— G4 封测门禁

## 已吸收的规范要点

- 应用端口只绑 `127.0.0.1`；云安全组/防火墙只开 Nginx 公网端口
- 持久数据用命名卷，独立于发布目录；备份独立于应用发布（G2）
- 部署脚本文件化（本目录 `deploy-release.sh`），不把长脚本嵌进 SSH 命令串
- env 变更后必须 `up -d --force-recreate`（restart 不重载 env）
- 记录每个发布使用的镜像 tag/digest，便于回滚
