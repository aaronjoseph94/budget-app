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
# Pinned and checksum-verified: an unverified binary that scans for secrets is
# a worse trade than no scan at all.
GITLEAKS_VERSION=8.30.0
GITLEAKS_SHA256=79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e

install_gitleaks() {
  local target_dir="$1" work tarball
  work="$(mktemp -d)"
  tarball="$work/gitleaks.tar.gz"
  curl -fsSL -o "$tarball" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
  echo "${GITLEAKS_SHA256}  ${tarball}" | sha256sum -c - >/dev/null
  tar -xzf "$tarball" -C "$work" gitleaks
  install -m 0755 "$work/gitleaks" "$target_dir/gitleaks"
  rm -rf "$work"
}

if command -v gitleaks >/dev/null 2>&1; then
  : # already installed; nothing to do
elif [ -w /usr/local/bin ]; then
  install_gitleaks /usr/local/bin
else
  mkdir -p "$HOME/.local/bin"
  install_gitleaks "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >>"$CLAUDE_ENV_FILE"
  fi
fi

echo "bootstrap ready: pnpm workspace installed, gitleaks $(gitleaks version)"
