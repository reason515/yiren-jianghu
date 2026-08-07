#!/usr/bin/env bash
# G2 健康监控：公网 + 容器 + 磁盘探针；失败写日志并退出非零。
# cron: */5 * * * * /opt/yiren-jianghu/deploy/scripts/healthcheck.sh
# 告警通道（邮件/钉钉 webhook）为 TODO：当前靠日志 + exit code 供外部采集。
set -uo pipefail
LOG=/var/log/yiren-healthcheck.log
now() { date '+%F %T'; }
fail=0

# 公网探针（Nginx → API）
if ! curl -fsS --max-time 10 http://127.0.0.1/health > /dev/null 2>&1; then
  echo "$(now) PUBLIC_API_DOWN" >> "$LOG"; fail=1
fi

# 容器健康（postgres/redis/api/worker 4 个）
cd /opt/yiren-jianghu
RUNNING=$(docker compose -f docker-compose.prod.yml ps --format '{{.State}}' 2>/dev/null | grep -c 'running' || true)
if [ "$RUNNING" -lt 4 ]; then
  echo "$(now) CONTAINER_DOWN (running=$RUNNING/4)" >> "$LOG"; fail=1
fi

# 磁盘（使用率 > 80% 告警）
AVAIL=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "${AVAIL:-0}" -gt 80 ]; then
  echo "$(now) DISK_HIGH ${AVAIL}%" >> "$LOG"; fail=1
fi

if [ "$fail" = 0 ]; then echo "$(now) OK" >> "$LOG"; fi
exit "$fail"
