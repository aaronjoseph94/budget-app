#!/usr/bin/env bash
# SessionStart bootstrap for Claude Code on the web.
#
# scripts/gates.sh fails closed: a required gate whose tool is missing reports
# MISCONFIGURED and exits 2, because a check that cannot run must never be
# reported as green. A fresh remote container has neither node_modules nor
# gitleaks, so without this hook every web session opens with the secrets gate
# unrunnable and no commit can honestly be called green.
#
# Idempotent, non-interactive, remote-only.
set -euo pipefail

# Local machines have their own toolchain; only the remote container needs this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# --- workspace dependencies -------------------------------------------------
# Frozen first, so a lockfile that has drifted from package.json is visible
# rather than silently rewritten during bootstrap. Fall back to a plain install
# only when it genuinely has moved ahead.
if ! pnpm install --frozen-lockfile --prefer-offline; then
  echo "bootstrap: lockfile out of date with package.json, installing unfrozen" >&2
  pnpm install
fi

# --- gitleaks, the secrets gate ---------------------------------------------
# Shared with the CI workflow, so both scan with the same pinned version.
./scripts/install-gitleaks.sh

# When it landed in ~/.local/bin, the rest of the session needs it on PATH.
if ! command -v gitleaks >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >>"$CLAUDE_ENV_FILE"
  fi
fi

echo "bootstrap ready: pnpm workspace installed, gitleaks $(gitleaks version)"
