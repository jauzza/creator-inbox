#!/bin/sh
# Local dev without Docker: uses a locally running Postgres (e.g. Homebrew postgresql@16).
# Creates the database if missing, applies migrations, seeds the simulator, then runs worker + web.
set -e
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
DB_NAME=$(printf '%s' "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
if command -v psql >/dev/null 2>&1; then
  psql "${DATABASE_URL%/*}/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || createdb "$DB_NAME" 2>/dev/null || psql "${DATABASE_URL%/*}/postgres" -c "CREATE DATABASE \"$DB_NAME\""
fi
npx prisma migrate deploy
npx tsx prisma/seed.ts
npx tsx src/worker/main.ts &
WORKER_PID=$!
trap 'kill $WORKER_PID 2>/dev/null' EXIT INT TERM
npx next dev -p "${PORT:-3000}"
