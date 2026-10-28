#!/bin/sh
# Container start: migrate → idempotent seed → serve.
set -e

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] seed (idempotent)"
python -m main.cli seed

# Optional first-run admin bootstrap — only when both env vars are set and
# no admin exists yet. Never ship these in production defaults.
if [ -n "$BOOTSTRAP_ADMIN_USERNAME" ] && [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  echo "[entrypoint] bootstrap-admin $BOOTSTRAP_ADMIN_USERNAME"
  python -m main.cli bootstrap-admin \
    --username "$BOOTSTRAP_ADMIN_USERNAME" \
    --password "$BOOTSTRAP_ADMIN_PASSWORD" \
    --name "${BOOTSTRAP_ADMIN_NAME:-مدیر مجموعه}" \
    --email "${BOOTSTRAP_ADMIN_EMAIL:-}" || true
fi

echo "[entrypoint] uvicorn"
exec uvicorn main.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"
