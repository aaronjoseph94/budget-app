#!/usr/bin/env bash
# Serves the web app on a fake Supabase at http://127.0.0.1:5275, for a look
# by hand or a one-off script (docs/design/rework/04-e2e.md). The suite,
# `pnpm e2e`, starts the same server itself from e2e.config.ts.
#
# The two values are invented: the stand-in answers every request in
# memory, so nothing reaches a real project and no real key is needed.
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_SUPABASE_URL=https://invented.supabase.co \
VITE_SUPABASE_ANON_KEY=invented-anon-key-for-preview-only \
  exec pnpm exec vite --config e2e/vite.preview.config.ts "$@"
