#!/usr/bin/env sh
set -eu

# First-time Let's Encrypt setup for:
#   tw1ngames.duckdns.org   — frontend
#   tw1ngames2.duckdns.org  — admin
#
# Prerequisites:
#   1. DuckDNS A-records point both domains to this server
#   2. Ports 80 and 443 are open on the firewall
#   3. CERTBOT_EMAIL is set in .env (or exported in shell)
#
# Usage (from repo root, on the server):
#   chmod +x scripts/init-letsencrypt.sh
#   ./scripts/init-letsencrypt.sh

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-tw1ngames.duckdns.org}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-tw1ngames2.duckdns.org}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

if [ -z "$CERTBOT_EMAIL" ]; then
  echo "CERTBOT_EMAIL is required. Add it to .env and rerun."
  exit 1
fi

DATA_PATH="${DATA_PATH:-./certbot}"
mkdir -p "$DATA_PATH/www" "$DATA_PATH/conf"

if [ ! -f "$DATA_PATH/conf/options-ssl-nginx.conf" ]; then
  echo "Downloading TLS options for nginx..."
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    -o "$DATA_PATH/conf/options-ssl-nginx.conf"
fi

if [ ! -f "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
  echo "Generating DH params (may take a minute)..."
  openssl dhparam -out "$DATA_PATH/conf/ssl-dhparams.pem" 2048
fi

if [ ! -d "$DATA_PATH/conf/live/$PRIMARY_DOMAIN" ]; then
  echo "Creating temporary self-signed certificate..."
  mkdir -p "$DATA_PATH/conf/live/$PRIMARY_DOMAIN"
  docker compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$PRIMARY_DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem \
      -subj /CN=localhost" certbot
fi

if [ ! -f nginx/default.ssl.conf ]; then
  cp nginx/default.conf nginx/default.ssl.conf
fi

echo "Starting nginx with bootstrap HTTP config..."
cp nginx/default.bootstrap.conf nginx/default.conf
docker compose up -d nginx

echo "Requesting Let's Encrypt certificate..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $CERTBOT_EMAIL \
    --agree-tos --no-eff-email \
    -d $PRIMARY_DOMAIN \
    -d $ADMIN_DOMAIN \
    --force-renewal" certbot

echo "Switching nginx to HTTPS config..."
cp nginx/default.ssl.conf nginx/default.conf
docker compose exec nginx nginx -s reload || docker compose up -d --force-recreate nginx

echo
echo "Done."
echo "  Frontend: https://$PRIMARY_DOMAIN"
echo "  Admin:    https://$ADMIN_DOMAIN"
echo
echo "Set in .env:"
echo "  PUBLIC_URL=https://$PRIMARY_DOMAIN"
echo "  CORS_ALLOW_ORIGINS=https://$PRIMARY_DOMAIN"
echo "  ADMIN_ALLOWED_ORIGINS=https://$ADMIN_DOMAIN"
echo
echo "Renewal: docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload"
