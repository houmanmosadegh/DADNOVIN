#!/bin/sh
# Database backup — dumps Postgres inside the compose `db` service.
# Usage: ./scripts/backup.sh [output-dir]   (default: ./backups)
set -e
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/dadnovin-$STAMP.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-dadnovin}" "${POSTGRES_DB:-dadnovin}" \
  | gzip -9 > "$FILE"

echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
