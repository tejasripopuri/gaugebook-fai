#!/usr/bin/env bash
# Gaugebook installer for a fresh Ubuntu 22.04/24.04 VPS. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/tejasripopuri/gaugebook-fai/main/deploy/install.sh | bash
# Optional: pass your domain, e.g. `... | bash -s -- gaugebook.example.com`
set -euo pipefail

REPO="${GAUGEBOOK_REPO:-https://github.com/tejasripopuri/gaugebook-fai.git}"
DIR=/opt/gaugebook
DOMAIN_ARG="${1:-}"

[ "$(id -u)" = 0 ] || { echo "Please run as root (use: sudo bash)"; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "Warning: this installer is tested on Ubuntu; continuing on ${PRETTY_NAME:-unknown}."

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git ufw openssl unattended-upgrades

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "==> Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Configuring the firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

echo "==> Getting Gaugebook"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  echo "==> Creating settings and secrets"
  if [ -n "$DOMAIN_ARG" ]; then
    DOMAIN="$DOMAIN_ARG"
  else
    IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
    DOMAIN="${IP//./-}.sslip.io"
  fi
  umask 077
  cat > .env <<ENV
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ENV
elif [ -n "$DOMAIN_ARG" ]; then
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN_ARG/" .env
fi
chmod 600 .env
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)

echo "==> Building and starting (this takes a few minutes the first time)"
docker compose up -d --build

echo "==> Scheduling nightly backups at 02:30"
chmod +x deploy/*.sh
cat > /etc/cron.d/gaugebook-backup <<CRON
30 2 * * * root $DIR/deploy/backup.sh >> /var/log/gaugebook-backup.log 2>&1
CRON

echo "==> Waiting for the app to become healthy"
for i in $(seq 1 60); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo
    echo "Gaugebook is running."
    echo "Open: https://$DOMAIN"
    echo "(The HTTPS certificate is issued on the first visit; if the page doesn't load, wait a minute and retry.)"
    exit 0
  fi
  sleep 3
done
echo "The app did not report healthy. Check: cd $DIR && docker compose logs --tail=100"
exit 1
