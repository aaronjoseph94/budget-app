#!/usr/bin/env bash
# Install the pinned gitleaks that the secrets gate runs.
#
# One copy, called by both .claude/hooks/session-start.sh and the CI workflow.
# Duplicating the pinned version in two places is how a session and CI end up
# scanning with different rules and disagreeing about whether a commit is clean.
#
# Idempotent: exits early when gitleaks is already on PATH.
set -euo pipefail

GITLEAKS_VERSION=8.30.0
GITLEAKS_SHA256=79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e

if command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks already installed: $(gitleaks version)"
  exit 0
fi

# An unverified binary that scans for secrets is a worse trade than no scan.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tarball="$work/gitleaks.tar.gz"

curl -fsSL -o "$tarball" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
echo "${GITLEAKS_SHA256}  ${tarball}" | sha256sum -c - >/dev/null
tar -xzf "$tarball" -C "$work" gitleaks

if [ -w /usr/local/bin ]; then
  target=/usr/local/bin
else
  target="$HOME/.local/bin"
  mkdir -p "$target"
fi
install -m 0755 "$work/gitleaks" "$target/gitleaks"
echo "installed gitleaks ${GITLEAKS_VERSION} to ${target}"
