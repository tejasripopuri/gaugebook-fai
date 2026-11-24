#!/usr/bin/env bash
# Update Gaugebook to the latest version on GitHub: backup, pull, rebuild, restart.
set -euo pipefail
cd "$(dirname "$0")/.."
./deploy/backup.sh
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Updated to $(git log -1 --format='%h %s')"
