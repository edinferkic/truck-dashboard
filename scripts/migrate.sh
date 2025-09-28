#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.."; pwd)"
MIG_DIR="$ROOT/server/migrations"

DB_URL_DEFAULT="postgresql://truck:truckpass@localhost:5432/truckdb"

# Use env or server/.env if present
DB_URL="${DATABASE_URL:-}"
if [ -z "${DB_URL:-}" ] && [ -f "$ROOT/server/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -E '^(DATABASE_URL)=' "$ROOT/server/.env" | xargs -I{} echo {})
  DB_URL="${DATABASE_URL:-}"
fi
DB_URL="${DB_URL:-$DB_URL_DEFAULT}"

echo "→ Running migrations against: $DB_URL"

shopt -s nullglob
for f in "$MIG_DIR"/*.sql; do
  echo "   - $f"
  if docker ps --format '{{.Names}}' | grep -qx 'truck_pg'; then
    docker exec -i truck_pg psql -v ON_ERROR_STOP=1 -U truck -d truckdb < "$f"
  else
    psql -v ON_ERROR_STOP=1 "$DB_URL" -f "$f"
  fi
done
echo "✓ Migrations complete"

