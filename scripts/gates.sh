#!/usr/bin/env bash
# Quality gates. FAILS CLOSED: a required gate whose command is missing reports
# MISCONFIGURED and exits non-zero. A check that cannot run is never green.
#
# Pattern from addyosmani/factory (template/.claude/scripts/gates.sh).
set -uo pipefail
cd "$(dirname "$0")/.."

LEVEL="${1:-full}"
declare -a PASSED=() FAILED=() MISCONFIGURED=()

have() { command -v "$1" >/dev/null 2>&1 || [ -x "node_modules/.bin/$1" ]; }

gate() {
  local name="$1" tool="$2"; shift 2
  if ! have "$tool"; then
    MISCONFIGURED+=("$name"); printf '  %-18s MISCONFIGURED (%s not installed)\n' "$name" "$tool"; return
  fi
  if "$@" >/tmp/gate-$name.log 2>&1; then
    PASSED+=("$name"); printf '  %-18s PASS\n' "$name"
  else
    FAILED+=("$name"); printf '  %-18s FAIL\n' "$name"; tail -15 "/tmp/gate-$name.log" | sed 's/^/      /'
  fi
}

echo "Running gates (level=$LEVEL)"
gate types   tsc       npx tsc --build --force
gate lint    eslint    npx eslint .
# NB: no `--validate` flag. dependency-cruiser validates whenever its config
# carries rules; passing an unknown flag makes it print usage and exit 0, which
# is a gate that reports PASS without ever looking at the graph.
gate purity  depcruise npx depcruise --config .dependency-cruiser.cjs packages apps supabase/functions
# `gitleaks dir` scans the working tree — the code being gated. `gitleaks
# detect` walks COMMITS instead, so it is structurally blind to an uncommitted
# edit and reported PASS on a live-looking key sitting in a source file. Both
# matter; this is the one that can stop a secret before it reaches history.
gate secrets gitleaks  gitleaks dir --config .gitleaks-tree.toml --redact --no-banner .

# A .env file is where keys live, so the working-tree scan allows one; a
# tracked one (`git add -f` gets past .gitignore) would be published with
# the repository. Only .env.example may be committed (security-a-07).
no_env_files() {
  local found
  found=$(git ls-files | grep -E '(^|/)\.env(\.[^/]*)?$' | grep -v -E '(^|/)\.env\.example$')
  [ -z "$found" ] || { echo "tracked environment file(s):"; echo "$found"; return 1; }
}
gate envfile git       no_env_files
gate golden  vitest    npx vitest run

# The owner asked (2026-09-24) for the workbook vendor's name to go from
# everything in the repository. Its second letter is a character class here,
# so this file cannot match its own pattern; -i is every letter case, and -I
# skips binaries. A git grep that fails (exit 2 or more) is not "none found".
no_brand() {
  local found=0 rc
  git grep -n -I -i -e 'w[i]nky'
  rc=$?
  case $rc in
    0) found=1 ;;
    1) ;;
    *) echo "git grep failed with exit $rc"; return 2 ;;
  esac
  # A file or folder named with it has no line to match, so paths too.
  if git ls-files | grep -i -e 'w[i]nky'; then found=1; fi
  [ "$found" -eq 0 ]
}
gate brand   git       no_brand

if [ "$LEVEL" = "full" ]; then
  # The history scan still earns its place: it catches a secret committed
  # earlier, which a working-tree scan cannot see once the file is deleted.
  gate history  gitleaks gitleaks detect --config .gitleaks.toml --redact --no-banner --source .
  # Applies every migration to a throwaway database and asserts the schema
  # refuses what it claims to. Never touches the hosted project.
  gate schema   psql     ./scripts/verify-migrations.sh
  gate coverage vitest   npx vitest run --coverage
  gate deps     pnpm     pnpm audit --audit-level high
  # Builds the web app into a temporary folder and fails when the JavaScript
  # a phone loads before the first screen is over budget (CONSTRAINTS.md).
  gate bundle   node     node scripts/check-bundle.mjs
fi

STATUS=GREEN
[ ${#FAILED[@]} -gt 0 ] && STATUS=RED
[ ${#MISCONFIGURED[@]} -gt 0 ] && STATUS=MISCONFIGURED

join() { local IFS=,; echo "${*:-none}"; }
echo
echo "BUDGET_GATES: level=$LEVEL status=$STATUS passed=${#PASSED[@]} failed=${#FAILED[@]} failing=$(join "${FAILED[@]+"${FAILED[@]}"}") misconfigured=$(join "${MISCONFIGURED[@]+"${MISCONFIGURED[@]}"}")"

case "$STATUS" in
  GREEN) exit 0 ;;
  RED) exit 1 ;;
  MISCONFIGURED) exit 2 ;;
esac
