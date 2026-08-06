#!/usr/bin/env bash
# 《一人江湖》服务器端部署脚本（可审计、可回滚）。
# 由 GitHub Actions 上传后执行，也可手动运行：
#   ./deploy/scripts/deploy-release.sh [TAG]
# 前置：本机已放置 docker-compose.prod.yml 与 .env（chmod 600）。
set -euo pipefail

TAG="${1:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

export API_IMAGE="ghcr.io/reason515/yiren-jianghu/api:${TAG}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "== [1/4] 拉取镜像 ${API_IMAGE} =="
"${COMPOSE[@]}" pull api

echo "== [2/4] 重建服务 =="
"${COMPOSE[@]}" up -d api
docker image prune -f

echo "== [3/4] 部署验证（健康 + 就绪） =="
sleep 3
API_PORT="${API_PORT:-3000}"
curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null || { echo "❌ /health 失败"; exit 1; }
curl -fsS "http://127.0.0.1:${API_PORT}/ready" >/dev/null || { echo "❌ /ready 失败（依赖未就绪）"; exit 1; }
echo "✅ /health 与 /ready 通过"

echo "== [4/4] 完成 =="
"${COMPOSE[@]}" ps
