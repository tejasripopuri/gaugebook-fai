#!/usr/bin/env bash
# Switch Gaugebook to your own domain (after its DNS A record points to this server).
# Usage: deploy/set-domain.sh gaugebook.example.com
set -euo pipefail
cd "$(dirname "$0")/.."
NEW="${1:?Usage: deploy/set-domain.sh your.domain.com}"
IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)
RESOLVED=$(getent ahostsv4 "$NEW" | awk 'NR==1{print $1}' || true)
if [ -n "$IP" ] && [ "$RESOLVED" != "$IP" ]; then
  echo "Warning: $NEW resolves to '${RESOLVED:-nothing}', but this server is $IP."
  echo "Add a DNS A record for $NEW pointing to $IP, wait a few minutes, then run this again."
  exit 1
fi
sed -i "s/^DOMAIN=.*/DOMAIN=$NEW/" .env
docker compose up -d caddy --force-recreate
echo "Done. Open https://$NEW"
