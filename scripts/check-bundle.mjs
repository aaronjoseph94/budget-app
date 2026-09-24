#!/usr/bin/env node
// The web build, measured: what a phone downloads before it can draw the
// first screen.
//
// 1. First-load JavaScript: the entry script and every chunk index.html
//    preloads beside it, gzipped, must stay within BUDGET. The Month opens
//    first (decision 1) and waits for all of it (PERF-3, PERF-8).
//
// Built into a temporary folder, so the working tree is untouched.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Measured 186 KB after PERF-3 split the screens out; the skill's budget is
// 200 KB, which leaves room for small growth and none for a regression.
const BUDGET_KB = 200

const out = mkdtempSync(join(tmpdir(), 'budget-bundle-'))
try {
  execFileSync('pnpm', ['--filter', '@budget/app-client', 'exec', 'vite', 'build', '--outDir', out, '--emptyOutDir'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-public-key-for-measuring',
    },
  })

  const html = readFileSync(join(out, 'index.html'), 'utf8')
  const first = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="\/([^"]+\.js)"/g)].map((m) => m[1])
  const sizes = first.map((file) => ({ file, kb: gzipSync(readFileSync(join(out, file))).length / 1024 }))
  const total = sizes.reduce((sum, s) => sum + s.kb, 0)
  for (const s of sizes) console.log(`  ${s.file.padEnd(40)} ${s.kb.toFixed(2)} KB gzipped`)
  console.log(`first-load JavaScript: ${total.toFixed(2)} KB gzipped (budget ${BUDGET_KB} KB)`)

  let failed = false
  if (first.length === 0) {
    console.log('FAIL: no entry script found in index.html')
    failed = true
  }
  if (total > BUDGET_KB) {
    console.log(`FAIL: first-load JavaScript is over budget by ${(total - BUDGET_KB).toFixed(2)} KB`)
    failed = true
  }
  process.exitCode = failed ? 1 : 0
} finally {
  rmSync(out, { recursive: true, force: true })
}
