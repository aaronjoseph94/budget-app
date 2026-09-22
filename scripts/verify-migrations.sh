#!/usr/bin/env bash
# Apply every migration to an empty database and assert the schema refuses what
# it claims to refuse.
#
# This is what moves CONSTRAINTS.md's "RLS coverage" and "Migration replay" rows
# out of Pending: both now name a command that runs. It uses a throwaway
# cluster in a temp directory and never touches the hosted project.
#
# Supabase provides `auth` and `storage` itself; supabase/local-stub.sql stands
# in for them so the migrations can be applied verbatim rather than edited for
# local use — a migration that has to be modified to be tested is not the
# migration that runs in production.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "verify-migrations: no PostgreSQL server found (looked in /usr/lib/postgresql/*/bin)" >&2
  exit 2 # MISCONFIGURED, per the fail-closed convention in gates.sh
fi

WORK="$(mktemp -d)"
PORT="$(shuf -i 20000-29999 -n 1)"
OWNER="$(id -un)"

cleanup() {
  "$PGBIN/pg_ctl" -D "$WORK/data" -s -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# initdb refuses to run as root, so use an unprivileged account when we are.
RUN=(bash -c)
if [ "$(id -u)" -eq 0 ]; then
  id -u pgverify >/dev/null 2>&1 || useradd -m pgverify
  chown -R pgverify "$WORK"
  OWNER=pgverify
  RUN=(su pgverify -c)
fi

"${RUN[@]}" "$PGBIN/initdb -D '$WORK/data' -A trust -U postgres" >"$WORK/initdb.log" 2>&1
"${RUN[@]}" "$PGBIN/pg_ctl -D '$WORK/data' -o '-p $PORT -k $WORK' -l '$WORK/pg.log' -w start" \
  >"$WORK/start.log" 2>&1

PSQL=("$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f "$ROOT/supabase/local-stub.sql" >/dev/null

# Forward-only and ordered: the filenames are the order, so a migration that
# depends on an earlier one is applied after it, exactly as in production.
for migration in "$ROOT"/supabase/migrations/*.sql; do
  printf '  applying %s\n' "$(basename "$migration")"
  "${PSQL[@]}" -f "$migration" >/dev/null
done

echo "  asserting the schema refuses what it should"
"${PSQL[@]}" -f "$ROOT/supabase/tests/schema-assertions.sql" 2>&1 |
  sed 's/^/    /'

echo "verify-migrations: OK"
