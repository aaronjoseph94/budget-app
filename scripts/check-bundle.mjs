#!/usr/bin/env node
// The web build, measured: what a phone downloads before it can draw the
// first screen, and which build-time variables were compiled into it.
//
// 1. First-load JavaScript: the entry script and every chunk index.html
//    preloads beside it, gzipped, must stay within BUDGET. The Month opens
//    first (decision 1) and waits for all of it (PERF-3, PERF-8).
// 2. The Month's title font is asked for with the page, not only once the
//    CSS naming it has arrived: the title is the largest thing the first
//    screen paints, and the font's late swap moved it (PERF-6).
// 3. Only the two public values may be compiled in. The build is run with a
//    probe VITE_ variable that no code reads; finding its value in the
//    output means every VITE_ variable in the environment ships (SEC-4).
// 4. The one-time updates under setup/ (ADR 0007) are exactly every
//    migration from 0015 on and the AI helper, each byte for byte as
//    committed: nothing more is published, and nothing is changed on the way.
//
// Built into a temporary folder, so the working tree is untouched.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Measured 186 KB after PERF-3 split the screens out; the skill's budget is
// 200 KB, which leaves room for small growth and none for a regression.
const BUDGET_KB = 200
const PROBE = 'bundle-probe-value-that-must-not-ship'

const out = mkdtempSync(join(tmpdir(), 'budget-bundle-'))
try {
  execFileSync('pnpm', ['--filter', '@budget/app-client', 'exec', 'vite', 'build', '--outDir', out, '--emptyOutDir'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-public-key-for-measuring',
      VITE_BUNDLE_PROBE: PROBE,
    },
  })

  const html = readFileSync(join(out, 'index.html'), 'utf8')
  const first = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="\/([^"]+\.js)"/g)].map((m) => m[1])
  const sizes = first.map((file) => ({ file, kb: gzipSync(readFileSync(join(out, file))).length / 1024 }))
  const total = sizes.reduce((sum, s) => sum + s.kb, 0)
  for (const s of sizes) console.log(`  ${s.file.padEnd(40)} ${s.kb.toFixed(2)} KB gzipped`)
  console.log(`first-load JavaScript: ${total.toFixed(2)} KB gzipped (budget ${BUDGET_KB} KB)`)

  const assets = join(out, 'assets')
  const shipped = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
  const named = [...new Set(shipped.match(/VITE_[A-Z0-9_]+/g) ?? [])].filter((n) => n !== 'VITE_SUPABASE_URL' && n !== 'VITE_SUPABASE_ANON_KEY')

  let failed = false
  if (!/<link rel="preload" href="\/fonts\/caveat-700-latin\.woff2" as="font" type="font\/woff2" crossorigin/.test(html)) {
    console.log('FAIL: index.html does not preload the title font, /fonts/caveat-700-latin.woff2')
    failed = true
  }
  if (first.length === 0) {
    console.log('FAIL: no entry script found in index.html')
    failed = true
  }
  if (total > BUDGET_KB) {
    console.log(`FAIL: first-load JavaScript is over budget by ${(total - BUDGET_KB).toFixed(2)} KB`)
    failed = true
  }
  if (shipped.includes(PROBE) || named.length > 0) {
    console.log(`FAIL: build-time variables shipped beyond the two public ones: ${named.join(', ') || PROBE}`)
    failed = true
  }
  const migrations = join(import.meta.dirname, '..', 'supabase', 'migrations')
  const sources = new Map([
    ...readdirSync(migrations).filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/.test(n) && n >= '0015').map((n) => [n, join(migrations, n)]),
    ['ai-function.ts', join(import.meta.dirname, '..', 'supabase', 'functions', 'ai', 'index.ts')],
  ])
  const setup = join(out, 'setup')
  const published = existsSync(setup) ? readdirSync(setup).sort() : []
  const wanted = [...sources.keys()].sort()
  if (published.join() !== wanted.join()) {
    console.log(`FAIL: setup/ holds ${published.join(', ') || 'nothing'}; it must hold exactly ${wanted.join(', ')}`)
    failed = true
  }
  for (const name of published.filter((n) => sources.has(n))) {
    if (!readFileSync(join(setup, name)).equals(readFileSync(sources.get(name)))) {
      console.log(`FAIL: setup/${name} is not byte for byte the committed file`)
      failed = true
    }
  }
  console.log(`setup/: ${published.join(', ')}`)
  process.exitCode = failed ? 1 : 0
} finally {
  rmSync(out, { recursive: true, force: true })
}
