#!/usr/bin/env bash
# G2 战报归档：30 天前的 pvp_matches.report 置空（保留结果/积分/快照），
# 战报事件流是容量增长大头（F4 预警）。归档后战报详情返回空事件流。
# cron: 0 4 * * 0 /opt/yiren-jianghu/deploy/scripts/archive.sh >> /var/log/yiren-archive.log 2>&1
set -uo pipefail
cd /opt/yiren-jianghu
docker compose -f docker-compose.prod.yml exec -T postgres psql -U yiren -d yiren_jianghu -c \
  "UPDATE pvp_matches SET report = NULL WHERE created_at < now() - interval '30 days' AND report IS NOT NULL;" > /dev/null
echo "archive ok: $(date '+%F %T')"
