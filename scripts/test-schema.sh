#!/usr/bin/env bash
# Applies the Neon migration to a throwaway Postgres and runs the schema smoke test.
# Set DATABASE_URL to use an existing empty database. Otherwise a temporary
# cluster is started. Never point this at the hosted Neon project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() {
  if [[ -n "${DATA_DIR:-}" ]]; then
    if [[ -n "${PG_CTL:-}" ]]; then
      "$PG_CTL" -D "$DATA_DIR" -m fast stop >/dev/null 2>&1 || true
    fi
    rm -rf "$DATA_DIR"
  fi
}
trap cleanup EXIT

find_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return
  fi
  local candidate
  for candidate in /usr/lib/postgresql/*/bin/"$name"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  return 1
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  INITDB="$(find_bin initdb)"
  PG_CTL="$(find_bin pg_ctl)"
  CREATEDB="$(find_bin createdb)"
  PSQL="$(find_bin psql)"
  DATA_DIR="$(mktemp -d)"
  PORT="${PGPORT:-55432}"
  "$INITDB" -D "$DATA_DIR" --username=postgres --auth=trust --no-instructions >/dev/null
  "$PG_CTL" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR" -l "$DATA_DIR/server.log" start >/dev/null
  "$CREATEDB" -h 127.0.0.1 -p "$PORT" -U postgres goodnote
  DATABASE_URL="postgres://postgres@127.0.0.1:${PORT}/goodnote"
else
  PSQL="$(find_bin psql)"
fi

shopt -s nullglob
migrations=("$ROOT"/db/migrations/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "no migrations found" >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/db/tests/schema_smoke.sql"
echo "schema smoke test passed"
