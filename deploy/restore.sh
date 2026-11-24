#!/usr/bin/env bash
# Restore a backup made by backup.sh. REPLACES all current data.
# Usage: deploy/restore.sh 20261201-023000
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP="${1:?Usage: deploy/restore.sh <timestamp>  (see ls backups/)}"
sha256sum -c "backups/SHA256SUMS-$STAMP"
read -r -p "This replaces ALL current Gaugebook data with backup $STAMP. Type RESTORE to continue: " ok
[ "$ok" = RESTORE ] || { echo "Cancelled."; exit 1; }
./deploy/backup.sh   # safety copy of the current state first
docker compose stop app
docker compose exec -T db pg_restore -U gaugebook -d gaugebook --clean --if-exists < "backups/db-$STAMP.dump"
docker compose run --rm -T --no-deps --entrypoint sh app -c 'rm -rf /data/files/* && tar -C /data -xzf -' < "backups/files-$STAMP.tar.gz"
docker compose start app
echo "Restored backup $STAMP."
