#!/usr/bin/env bash
# Back up the database and uploaded drawings to /opt/gaugebook/backups (keeps 14 days).
# Copy these files off the server regularly (see README) - a backup on the same disk
# does not protect against losing the server.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups && chmod 700 backups
STAMP=$(date -u +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U gaugebook -d gaugebook --format=custom > "backups/db-$STAMP.dump"
docker compose exec -T app tar -C /data -czf - files > "backups/files-$STAMP.tar.gz"
sha256sum "backups/db-$STAMP.dump" "backups/files-$STAMP.tar.gz" > "backups/SHA256SUMS-$STAMP"
find backups -type f -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup $STAMP done ($(du -sh backups | cut -f1) total)"
