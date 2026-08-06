# 部署说明（G1 脚手架）

当前 CD 流程：GitHub Actions 构建 API 镜像 → 推送 GHCR → SSH 到服务器 `docker compose` 更新。

## 激活步骤

1. **服务器准备**（任意一台 Linux，如后续更换的服务器）：
   ```bash
   mkdir -p /opt/yiren-jianghu && cd /opt/yiren-jianghu
   # 复制本仓库 docker-compose.prod.yml 与 .env.example → .env（填真实密码）
   ```
2. **仓库 secrets**（Settings → Secrets and variables → Actions）：
   - `DEPLOY_HOST`：服务器 IP
   - `DEPLOY_USER`：SSH 用户名（建议非 root 专用部署账号）
   - `DEPLOY_SSH_KEY`：部署账号的私钥
3. **首次部署**：手动触发 `Deploy` workflow（workflow_dispatch）。

## 数据库迁移

首版镜像含迁移工具；服务器上可在容器内执行：

```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @yjh/api migrate:up
```

> 生产迁移策略将在 G1/G2 正式化（迁移作业独立于应用发布、回滚预案、备份先行）。

## 备份（G2 前置）

- 每日 `pg_dump` 到独立卷/对象存储；恢复演练后才能信任备份。
- Redis 为缓存/队列，不视为持久数据。

## 说明

- postgres/redis 不暴露公网；api 端口按 `.env` 映射，前置反向代理 + TLS（G1 完善）。
- `worker` 服务在 C7（挂机作业）落地后加入 compose；`h5` 在 E 阶段加入。
- 换服务器 = 新机复制本目录 + `.env` + 恢复数据库备份 + 触发部署，无手工装机依赖。
