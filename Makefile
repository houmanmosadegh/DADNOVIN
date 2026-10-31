# Dadnovin — common dev/ops commands.
# Requires: docker (compose v2). For frontend lint/test also local node 20+.
COMPOSE      := docker compose
COMPOSE_DEV  := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD := $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: up down dev logs build ps restart clean
.PHONY: migrate roles seed seed-dev bootstrap-admin
.PHONY: test test-backend test-frontend test-panel
.PHONY: lint format typecheck backup restore audit

# ── stack ─────────────────────────────────────────────────────────
up:            ## full stack, build + start (production-like)
	$(COMPOSE) up -d --build

dev:           ## dev stack — api hot-reload + db on localhost:5433
	$(COMPOSE_DEV) up --build

prod:          ## production override (needs production .env)
	$(COMPOSE_PROD) up -d --build

down:          ## stop everything (volumes/data kept)
	$(COMPOSE) down

logs:          ## tail all service logs
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

build:
	$(COMPOSE) build

restart:
	$(COMPOSE) restart api

# ── database ──────────────────────────────────────────────────────
migrate:       ## apply alembic migrations inside the api container
	$(COMPOSE) exec api alembic upgrade head

roles:         ## seed RBAC roles only (safe, idempotent)
	$(COMPOSE) exec api python -m main.cli roles

seed:          ## seed real site content (settings/pages/lawyers) — idempotent
	$(COMPOSE) exec api python -m main.cli seed

seed-dev:      ## fake demo data — development only
	$(COMPOSE) exec api python -m main.cli seed-dev

bootstrap-admin:  ## create first super admin: make bootstrap-admin U=admin P='StrongPass123'
	$(COMPOSE) exec api python -m main.cli bootstrap-admin \
	  --username "$(U)" --password "$(P)" --name "$(or N,مدیر مجموعه)"

backup:        ## dump the database to ./backups/
	sh scripts/backup.sh

restore:       ## restore a dump: make restore FILE=backups/x.sql.gz
	sh scripts/restore.sh $(FILE)

# ── quality ───────────────────────────────────────────────────────
test: test-backend test-frontend test-panel   ## all test suites

test-backend:  ## pytest inside the api image (no db service needed — tests use sqlite)
	$(COMPOSE) run --rm --no-deps api python -m pytest -q

test-frontend:
	cd frontend && npm test

test-panel:
	cd panel && npm test 2>/dev/null || true

lint:          ## ruff (backend) + prettier check (frontends)
	cd backend && .venv/bin/ruff check . || docker run --rm -v "$$PWD/backend:/app" -w /app python:3.12-slim sh -c "pip install -q ruff && ruff check ."
	cd backend && .venv/bin/ruff format --check . || true
	cd frontend && npm run format:check
	cd panel && npm run format:check

format:        ## auto-format everything (ruff format + prettier)
	cd backend && .venv/bin/ruff format .
	cd frontend && npm run format
	cd panel && npm run format

typecheck:     ## tsc for both frontends
	cd frontend && npx tsc --noEmit
	cd panel && npx tsc --noEmit

audit:         ## npm audit for both frontends + pip check for backend
	cd frontend && npm audit --omit=dev
	cd panel && npm audit --omit=dev
	cd backend && .venv/bin/pip check || true

help:          ## this list
	@grep -E "^[a-zA-Z_-]+:.*?## " Makefile | awk 'BEGIN {FS=":.*?## "} {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
