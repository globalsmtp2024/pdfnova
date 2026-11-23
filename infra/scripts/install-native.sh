#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN, for example DOMAIN=test.example.com}"
API_PORT="${API_PORT:-9910}"
WEB_PORT="${WEB_PORT:-9909}"
APP_DIR="${APP_DIR:-/opt/pdfnova}"
REPO_URL="${REPO_URL:-https://github.com/globalsmtp2024/pdfnova.git}"
BRANCH="${BRANCH:-development}"
ENV_FILE=/etc/pdfnova/pdfnova.env
STATE_DIR=/var/lib/pdfnova
SERVICE_USER=pdfnova
REDIS_DB="${REDIS_DB:-7}"

log() { printf '\n== %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "run as root"
[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] || fail "no certificate for ${DOMAIN}; run certbot first"

for port in "$API_PORT" "$WEB_PORT"; do
  if ss -ltn "( sport = :${port} )" | grep -q LISTEN; then
    if ! systemctl is-active --quiet pdfnova-api pdfnova-web 2>/dev/null; then
      fail "port ${port} is already in use"
    fi
  fi
done

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y qpdf libreoffice-writer libreoffice-calc libreoffice-impress \
  tesseract-ocr tesseract-ocr-eng tesseract-ocr-urd fonts-noto fonts-dejavu-core \
  python3.12 python3.12-venv python3-dev build-essential redis-server git curl ca-certificates xz-utils
command -v psql >/dev/null || apt-get install -y postgresql
if ! command -v google-chrome >/dev/null && ! command -v chromium >/dev/null; then
  curl -fsSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y /tmp/chrome.deb
fi
NODE_VERSION="${NODE_VERSION:-22.23.2}"
NODE_DIR=/opt/pdfnova-node
if [ ! -x "$NODE_DIR/bin/node" ]; then
  curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  rm -rf "$NODE_DIR" /tmp/node-extract
  mkdir -p /tmp/node-extract
  tar -xJf /tmp/node.tar.xz -C /tmp/node-extract
  mv "/tmp/node-extract/node-v${NODE_VERSION}-linux-x64" "$NODE_DIR"
  rm -rf /tmp/node-extract /tmp/node.tar.xz
fi
"$NODE_DIR/bin/node" --version
systemctl enable --now redis-server
systemctl enable --now postgresql

log "Service user and folders"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$STATE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$STATE_DIR"/{storage,work,home,u2net} /var/log/pdfnova /etc/pdfnova
chown -R "$SERVICE_USER:$SERVICE_USER" "$STATE_DIR" /var/log/pdfnova

log "Secrets and environment file"
if [ -f "$ENV_FILE" ]; then
  echo "keeping existing $ENV_FILE"
else
  secret() { python3 -c "import secrets;print(secrets.token_urlsafe($1))"; }
  DB_PASSWORD="$(secret 24)"
  SECRET_KEY_VALUE="$(secret 64)"
  STORAGE_KEY_VALUE="$(python3 -c 'import os,base64;print(base64.b64encode(os.urandom(32)).decode())')"
  cat > "$ENV_FILE" <<ENV
ENVIRONMENT=production
COOKIE_SECURE=true
SECRET_KEY=${SECRET_KEY_VALUE}
STORAGE_ENCRYPTION_KEY=${STORAGE_KEY_VALUE}
DATABASE_URL=postgresql+asyncpg://pdfnova:${DB_PASSWORD}@127.0.0.1:5432/pdfnova
REDIS_URL=redis://127.0.0.1:6379/${REDIS_DB}
QUEUE_BACKEND=arq
RATE_LIMIT_BACKEND=redis
STORAGE_BACKEND=local
STORAGE_LOCAL_ROOT=${STATE_DIR}/storage
WORK_ROOT=${STATE_DIR}/work
PUBLIC_API_URL=https://${DOMAIN}
PUBLIC_WEB_URL=https://${DOMAIN}
CORS_ORIGINS=["https://${DOMAIN}"]
EMAIL_BACKEND=console
U2NET_HOME=${STATE_DIR}/u2net
BACKGROUND_WORKERS_IN_API=false
AI_SHARED_PROVIDER=google
AI_SHARED_API_KEY=
AI_MODEL_OVERRIDE=gemini-3.5-flash-lite
ENV
  chown root:"$SERVICE_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi

log "Database"
DB_PASSWORD_FROM_ENV="$(sed -n 's#^DATABASE_URL=postgresql+asyncpg://pdfnova:\([^@]*\)@.*#\1#p' "$ENV_FILE")"
[ -n "$DB_PASSWORD_FROM_ENV" ] || fail "could not read the database password from $ENV_FILE"
if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='pdfnova'" | grep -q 1; then
  sudo -u postgres psql -c "alter user pdfnova with password '${DB_PASSWORD_FROM_ENV}';"
else
  sudo -u postgres psql -c "create user pdfnova with password '${DB_PASSWORD_FROM_ENV}';"
fi
sudo -u postgres psql -tAc "select 1 from pg_database where datname='pdfnova'" | grep -q 1 \
  || sudo -u postgres psql -c "create database pdfnova owner pdfnova;"

log "Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

log "Python environment"
[ -x "$APP_DIR/apps/api/.venv/bin/python" ] || sudo -u "$SERVICE_USER" python3.12 -m venv "$APP_DIR/apps/api/.venv"
sudo -u "$SERVICE_USER" env HOME="$STATE_DIR/home" "$APP_DIR/apps/api/.venv/bin/pip" install --upgrade pip
sudo -u "$SERVICE_USER" env HOME="$STATE_DIR/home" "$APP_DIR/apps/api/.venv/bin/pip" install "$APP_DIR/apps/api"
sudo -u "$SERVICE_USER" env HOME="$STATE_DIR/home" U2NET_HOME="$STATE_DIR/u2net" \
  "$APP_DIR/apps/api/.venv/bin/python" -c "from rembg import new_session; new_session('u2netp')"

log "Web build"
cd "$APP_DIR/apps/web"
sudo -u "$SERVICE_USER" env HOME="$STATE_DIR/home" PATH="$NODE_DIR/bin:$PATH" npm ci
sudo -u "$SERVICE_USER" env HOME="$STATE_DIR/home" PATH="$NODE_DIR/bin:$PATH" API_INTERNAL_URL="http://127.0.0.1:${API_PORT}" npm run build
sudo -u "$SERVICE_USER" rm -rf .next/standalone/apps/web/.next/static .next/standalone/apps/web/public
sudo -u "$SERVICE_USER" cp -r .next/static .next/standalone/apps/web/.next/static
sudo -u "$SERVICE_USER" cp -r public .next/standalone/apps/web/public

log "Services"
cp "$APP_DIR"/infra/systemd/pdfnova-api.service "$APP_DIR"/infra/systemd/pdfnova-web.service \
  "$APP_DIR"/infra/systemd/pdfnova-background.service "$APP_DIR"/infra/systemd/pdfnova-worker@.service /etc/systemd/system/
sed -i "s/--port 8000/--port ${API_PORT}/" /etc/systemd/system/pdfnova-api.service
sed -i "s/Environment=PORT=3000/Environment=PORT=${WEB_PORT}/; s#127.0.0.1:8000#127.0.0.1:${API_PORT}#; s#/usr/bin/node#${NODE_DIR}/bin/node#" /etc/systemd/system/pdfnova-web.service
systemctl daemon-reload
systemctl enable pdfnova-api pdfnova-web pdfnova-background \
  pdfnova-worker@DefaultWorker pdfnova-worker@HighPriorityWorker pdfnova-worker@OfficeWorker
systemctl restart pdfnova-api pdfnova-web pdfnova-background \
  pdfnova-worker@DefaultWorker pdfnova-worker@HighPriorityWorker pdfnova-worker@OfficeWorker

log "Waiting for the API"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health/live" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${API_PORT}/health/live" || fail "API did not start; run: journalctl -u pdfnova-api -n 80 --no-pager"
echo
curl -fsSI "http://127.0.0.1:${WEB_PORT}/" | head -1 || fail "web did not start; run: journalctl -u pdfnova-web -n 80 --no-pager"

log "nginx"
SITE=/etc/nginx/sites-available/pdfnova
[ -f "$SITE" ] && cp "$SITE" "${SITE}.bak.$(date +%s)"
sed "s/pdfnova.example.com/${DOMAIN}/g; s/127.0.0.1:8000/127.0.0.1:${API_PORT}/g; s/127.0.0.1:3000/127.0.0.1:${WEB_PORT}/g; /^[[:space:]]*http2 on;\$/d; s/listen 443 ssl;/listen 443 ssl http2;/; s/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/" \
  "$APP_DIR/infra/nginx/pdfnova-host.conf" > "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/pdfnova
if nginx -t; then
  systemctl reload nginx
else
  LATEST_BACKUP="$(ls -1t "${SITE}".bak.* 2>/dev/null | head -1 || true)"
  [ -n "$LATEST_BACKUP" ] && cp "$LATEST_BACKUP" "$SITE"
  fail "nginx test failed; the previous site file was restored and nginx was not reloaded"
fi

log "Done"
echo "Open https://${DOMAIN}"
echo "Add your AI key: nano ${ENV_FILE}  (AI_SHARED_API_KEY=...), then: systemctl restart pdfnova-api 'pdfnova-worker@*'"
