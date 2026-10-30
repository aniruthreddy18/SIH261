#!/bin/sh
# Container entry point: prepare the database on the persistent volume, then serve the app.
# Migrations are idempotent; the demo data is seeded only into an empty database, so a redeploy
# never overwrites what is already on the volume.
set -e

DB_FILE="${DATABASE_URL#file:}"
mkdir -p "$(dirname "$DB_FILE")" "${STORAGE_DIR:-/data/storage}"

npx prisma migrate deploy
npx tsx scripts/seed-if-empty.ts

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
