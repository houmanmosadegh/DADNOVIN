#!/bin/sh
# Container start: migrate → idempotent seed → serve.
set -e

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] roles (RBAC prerequisites)"
python -m main.cli roles

# Content seed is dev/explicit only — production never auto-seeds demo
# settings/pages/lawyers. Enable with SEED_ON_BOOT=true (dev compose does).
if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[entrypoint] seed (SEED_ON_BOOT=true)"
  python -m main.cli seed
fi

# Optional first-run admin bootstrap — only when both env vars are set and
# no admin exists yet. Never ship these in production defaults.
if [ -n "$BOOTSTRAP_ADMIN_USERNAME" ] && [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  echo "[entrypoint] bootstrap-admin $BOOTSTRAP_ADMIN_USERNAME"
  rc=0
  python -m main.cli bootstrap-admin \
    --username "$BOOTSTRAP_ADMIN_USERNAME" \
    --password "$BOOTSTRAP_ADMIN_PASSWORD" \
    --name "${BOOTSTRAP_ADMIN_NAME:-مدیر مجموعه}" \
    --email "${BOOTSTRAP_ADMIN_EMAIL:-}" || rc=$?
  # rc=3 → user already exists (expected on restart); anything else is a real failure — surface it
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ]; then
    echo "[entrypoint] WARNING: bootstrap-admin failed (rc=$rc)" >&2
  fi
fi

echo "[entrypoint] uvicorn"
if [ "$UVICORN_RELOAD" = "1" ]; then
  exec uvicorn main.main:app --host 0.0.0.0 --port 8000 --reload
fi
exec uvicorn main.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"
