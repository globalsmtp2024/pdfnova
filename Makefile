.PHONY: dev down logs env test test-api test-web lint lint-api lint-web api web migrate seed

API_DIR := apps/api
WEB_DIR := apps/web

dev: env
	docker compose up --build -d
	@echo "PDFNova is starting at http://localhost:$${HTTP_PORT:-8080}"

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

env:
	@test -f .env || (cp .env.example .env \
		&& sed -i.bak "s|^SECRET_KEY=.*|SECRET_KEY=$$(python3 -c 'import secrets;print(secrets.token_urlsafe(64))')|" .env \
		&& sed -i.bak "s|^STORAGE_ENCRYPTION_KEY=.*|STORAGE_ENCRYPTION_KEY=$$(python3 -c 'import os,base64;print(base64.b64encode(os.urandom(32)).decode())')|" .env \
		&& sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')|" .env \
		&& sed -i.bak "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')|" .env \
		&& rm -f .env.bak && echo "Created .env with fresh secrets")

api:
	cd $(API_DIR) && .venv/bin/python -m alembic upgrade head && .venv/bin/python -m uvicorn app.main:app --reload

web:
	cd $(WEB_DIR) && npm run dev

migrate:
	cd $(API_DIR) && .venv/bin/python -m alembic upgrade head

seed:
	cd $(API_DIR) && .venv/bin/python -m alembic upgrade head && .venv/bin/python -m app.seed --admin

test: test-api test-web

test-api:
	cd $(API_DIR) && .venv/bin/python -m pytest

test-web:
	cd $(WEB_DIR) && npm test

lint: lint-api lint-web

lint-api:
	cd $(API_DIR) && .venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check . && .venv/bin/python -m mypy app

lint-web:
	cd $(WEB_DIR) && npm run lint && npm run typecheck && npm run format:check
