#!/usr/bin/env bash
# G2 数据库备份：每日 pg_dump 全量 + gzip + 保留最近 14 份。
# cron: 0 3 * * * /opt/yiren-jianghu/deploy/scripts/backup.sh >> /var/log/yiren-backup.log 2>&1
set -euo pipefail
cd /opt/yiren-jianghu
STAMP=$(date +%Y%m%d-%H%M)
OUT=backups/yiren-$STAMP.sql.gz
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U yiren yiren_jianghu | gzip > "$OUT"
ls -t backups/yiren-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
