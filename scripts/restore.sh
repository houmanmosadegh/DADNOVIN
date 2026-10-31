#!/bin/sh
# Database restore — loads a .sql(.gz) dump into the compose `db` service.
# Usage: ./scripts/restore.sh backups/dadnovin-20240101-120000.sql.gz
#
# WARNING: drops and recreates the public schema — all current data is lost.
set -e
FILE="$1"
[ -f "$FILE" ] || { echo "usage: $0 <dump.sql[.gz]>" >&2; exit 1; }

echo "This will REPLACE all data in $(docker compose ps --format '{{.Name}}' db 2>/dev/null || echo 'the db service')."
printf "Type the database name (%s) to confirm: " "${POSTGRES_DB:-dadnovin}"
read -r confirm
[ "$confirm" = "${POSTGRES_DB:-dadnovin}" ] || { echo "aborted."; exit 1; }

docker compose exec -T db psql -U "${POSTGRES_USER:-dadnovin}" "${POSTGRES_DB:-dadnovin}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

case "$FILE" in
  *.gz)  zcat "$FILE" ;;
  *)     cat "$FILE" ;;
esac | docker compose exec -T db psql -U "${POSTGRES_USER:-dadnovin}" "${POSTGRES_DB:-dadnovin}" -q

echo "restored. Running migrations to bring schema to head…"
docker compose exec -T api alembic upgrade head
echo "done."
