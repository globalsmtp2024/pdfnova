# Deploying on one Ubuntu 24.04 VPS

Two supported paths. Pick one.

- **A. Docker Compose** (recommended): everything in containers, TLS from the host.
- **B. Native with systemd**: Python and Node run directly on the host. Commands below.

Replace `pdfnova.example.com` with your domain. Run commands as a sudo-capable user.

## 0. Server preparation (both paths)

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y ufw git curl ca-certificates certbot
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
sudo mkdir -p /var/www/certbot
```

Point the DNS `A` (and `AAAA`) record of your domain at the server before requesting certificates.

## A. Docker Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo git clone https://github.com/globalsmtp2024/pdfnova.git /opt/pdfnova
cd /opt/pdfnova
sudo cp .env.example .env
sudo nano .env
```

In `.env` set at least: `ENVIRONMENT=production`, `PUBLIC_URL=https://pdfnova.example.com`, `COOKIE_SECURE=true`,
strong values for `SECRET_KEY`, `STORAGE_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY`, and your SMTP settings
(`EMAIL_BACKEND=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`). Generate secrets with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
python3 -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Get a certificate (stop anything on port 80 first), then start the stack:

```bash
sudo certbot certonly --standalone -d pdfnova.example.com --cert-name pdfnova -m you@example.com --agree-tos -n
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS https://pdfnova.example.com/health/live
```

Renew certificates and reload nginx automatically:

```bash
echo '0 4 * * * root certbot renew -q --deploy-hook "docker compose -f /opt/pdfnova/docker-compose.yml -f /opt/pdfnova/docker-compose.prod.yml exec -T nginx nginx -s reload"' | sudo tee /etc/cron.d/pdfnova-certbot
```

Create the first administrator after registering that account on the site:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U pdfnova -d pdfnova -c "update users set is_admin = true where email = 'you@example.com';"
```

Update later with `git pull` followed by the same `up -d --build` command.

## B. Native install with systemd

### B1. System packages

```bash
sudo apt-get install -y qpdf libreoffice-writer libreoffice-calc libreoffice-impress \
  tesseract-ocr tesseract-ocr-eng tesseract-ocr-urd fonts-noto fonts-dejavu-core \
  postgresql redis-server nginx python3.12 python3.12-venv python3-dev build-essential libpq-dev
sudo apt-get install -y chromium
```

On Ubuntu 24.04 `chromium` is a snap wrapper. If HTML to PDF fails under systemd, install Google Chrome instead and
point the app at it with `CHROMIUM_BINARY`:

```bash
curl -fsSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y /tmp/chrome.deb
```

Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### B2. Database, user and folders

```bash
sudo -u postgres psql -c "create user pdfnova with password 'CHANGE-ME-DB-PASSWORD';"
sudo -u postgres psql -c "create database pdfnova owner pdfnova;"
sudo useradd --system --home /var/lib/pdfnova --shell /usr/sbin/nologin pdfnova
sudo mkdir -p /var/lib/pdfnova/{storage,work,home} /var/log/pdfnova /etc/pdfnova
sudo chown -R pdfnova:pdfnova /var/lib/pdfnova /var/log/pdfnova
```

### B3. Code, Python environment and web build

```bash
sudo git clone https://github.com/globalsmtp2024/pdfnova.git /opt/pdfnova
sudo chown -R pdfnova:pdfnova /opt/pdfnova
sudo -u pdfnova python3.12 -m venv /opt/pdfnova/apps/api/.venv
sudo -u pdfnova /opt/pdfnova/apps/api/.venv/bin/pip install /opt/pdfnova/apps/api
sudo -u pdfnova env U2NET_HOME=/var/lib/pdfnova/u2net /opt/pdfnova/apps/api/.venv/bin/python -c "from rembg import new_session; new_session('u2netp')"
cd /opt/pdfnova/apps/web
sudo -u pdfnova npm ci
sudo -u pdfnova env API_INTERNAL_URL=http://127.0.0.1:8000 npm run build
sudo -u pdfnova cp -r .next/static .next/standalone/apps/web/.next/static
sudo -u pdfnova cp -r public .next/standalone/apps/web/public
```

### B4. Environment file

```bash
sudo tee /etc/pdfnova/pdfnova.env >/dev/null <<'ENV'
ENVIRONMENT=production
COOKIE_SECURE=true
SECRET_KEY=CHANGE-ME-64-CHARS
STORAGE_ENCRYPTION_KEY=CHANGE-ME-BASE64-32-BYTES
DATABASE_URL=postgresql+asyncpg://pdfnova:CHANGE-ME-DB-PASSWORD@127.0.0.1:5432/pdfnova
REDIS_URL=redis://127.0.0.1:6379/0
QUEUE_BACKEND=arq
RATE_LIMIT_BACKEND=redis
STORAGE_BACKEND=local
STORAGE_LOCAL_ROOT=/var/lib/pdfnova/storage
WORK_ROOT=/var/lib/pdfnova/work
PUBLIC_API_URL=https://pdfnova.example.com
PUBLIC_WEB_URL=https://pdfnova.example.com
CORS_ORIGINS=["https://pdfnova.example.com"]
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=CHANGE-ME
SMTP_PASSWORD=CHANGE-ME
EMAIL_FROM=no-reply@example.com
U2NET_HOME=/var/lib/pdfnova/u2net
ENV
sudo chmod 640 /etc/pdfnova/pdfnova.env && sudo chown root:pdfnova /etc/pdfnova/pdfnova.env
```

Optional: `AI_SHARED_API_KEY`, `CLOUD_GOOGLE_CLIENT_ID` / `CLOUD_GOOGLE_CLIENT_SECRET`, `CLOUD_DROPBOX_APP_KEY` /
`CLOUD_DROPBOX_APP_SECRET`, `CLOUD_MICROSOFT_CLIENT_ID` / `CLOUD_MICROSOFT_CLIENT_SECRET`, `FAIR_USE_*` limits.
Redirect URI for cloud providers: `https://pdfnova.example.com/api/v1/cloud/<provider>/callback`.

### B5. Services

```bash
sudo cp /opt/pdfnova/infra/systemd/*.service /opt/pdfnova/infra/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql redis-server
sudo systemctl enable --now pdfnova-api pdfnova-web pdfnova-background
sudo systemctl enable --now pdfnova-worker@DefaultWorker pdfnova-worker@HighPriorityWorker pdfnova-worker@OfficeWorker
sudo systemctl enable --now pdfnova-backup.timer
systemctl --no-pager status pdfnova-api pdfnova-web pdfnova-background
curl -fsS http://127.0.0.1:8000/health/live
```

### B6. Nginx and TLS

```bash
sudo sed 's/pdfnova.example.com/YOUR.DOMAIN/g' /opt/pdfnova/infra/nginx/pdfnova-host.conf | sudo tee /etc/nginx/sites-available/pdfnova >/dev/null
sudo ln -sf /etc/nginx/sites-available/pdfnova /etc/nginx/sites-enabled/pdfnova
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot certonly --webroot -w /var/www/certbot -d YOUR.DOMAIN -m you@example.com --agree-tos -n
sudo nginx -t && sudo systemctl reload nginx
```

The nginx file leaves Server-Sent Events unbuffered for `/api/v1/tasks/<id>/events`. If you change it, keep
`proxy_buffering off`. Certbot renews with its systemd timer; add a reload hook:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
```

First administrator:

```bash
sudo -u postgres psql pdfnova -c "update users set is_admin = true where email = 'you@example.com';"
```

### B7. Updates, logs and backups

```bash
cd /opt/pdfnova && sudo -u pdfnova git pull
sudo -u pdfnova /opt/pdfnova/apps/api/.venv/bin/pip install /opt/pdfnova/apps/api
cd apps/web && sudo -u pdfnova npm ci && sudo -u pdfnova env API_INTERNAL_URL=http://127.0.0.1:8000 npm run build
sudo -u pdfnova cp -r .next/static .next/standalone/apps/web/.next/static && sudo -u pdfnova cp -r public .next/standalone/apps/web/public
sudo systemctl restart pdfnova-api pdfnova-web pdfnova-background 'pdfnova-worker@*'
journalctl -u pdfnova-api -f
```

Backups: the timer writes a daily `pg_dump` to `/var/backups/pdfnova` (14 days kept). Uploaded files are temporary by
design; back up `/var/lib/pdfnova/storage` only if you keep My files data there.
Restore: `sudo -u postgres pg_restore -d pdfnova --clean /var/backups/pdfnova/pdfnova-YYYY-MM-DD.dump`.

## Checks after deployment

```bash
curl -fsSI https://YOUR.DOMAIN/ | head -5
curl -fsS https://YOUR.DOMAIN/health/ready
curl -fsSN --max-time 3 https://YOUR.DOMAIN/api/v1/tools >/dev/null && echo api-ok
```

Open `/admin` as the administrator and confirm Database, Storage, qpdf, libreoffice, tesseract and chromium show OK.
