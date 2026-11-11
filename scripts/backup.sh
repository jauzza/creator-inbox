#!/bin/sh
# Local backup without Docker. Requires pg_dump. Output: backups/inbox-YYYY-MM-DD-HHMM.dump
# Restore: pg_restore -d "$DATABASE_URL" --clean --if-exists backups/<file>.dump
# MASTER_KEY is NOT in the dump: store it separately (password manager).
set -e
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
mkdir -p backups
OUT="backups/inbox-$(date +%Y-%m-%d-%H%M).dump"
pg_dump "$DATABASE_URL" -Fc -f "$OUT"
echo "Backup written to $OUT"
