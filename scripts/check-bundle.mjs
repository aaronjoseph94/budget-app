#!/usr/bin/env node
// The web build, measured: what a phone downloads before it can draw the
// first screen, and which build-time variables were compiled into it.
//
// 1. First-load JavaScript: the entry script and every chunk index.html
//    preloads beside it, gzipped, must stay within BUDGET. The Month opens
//    first (decision 1) and waits for all of it (PERF-3, PERF-8).
// 2. Only the two public values may be compiled in. The build is run with a
//    probe VITE_ variable that no code reads; finding its value in the
//    output means every VITE_ variable in the environment ships (SEC-4).
// 3. The one-time updates under setup/ (ADR 0007) are exactly every
//    migration from 0015 on, the AI helper and read-receipt, each byte for byte as
//    committed: nothing more is published, and nothing is changed on the way.
//    Beside them, mcp-function.ts, the AI apps server built from
//    packages/ai-apps (ADR 0012): it must open with its banner, import
//    nothing (the SDK and zod are bundled), and name no service key and no
//    AI host.
// 4. The JavaScript a browser runs names no AI service's API host and no
//    service-role key: every AI call goes through the `ai` helper (ADR 0004).
//    setup/ is left out, since it is the functions' own source, and is never
//    run by the page; apps/web/test/no-provider-hosts.test.ts checks the
//    app's source the same way.
// 5. The PDF statement reader loads with Add, not with the first screen:
//    no first-load file holds its `FlateDecode` (PERF-3). The package's
//    barrel is read by the Month's path for its small helpers, and without
//    "sideEffects": false the reader came along with them.
//
// Built into a temporary folder, so the working tree is untouched.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// The measured figure is in CONSTRAINTS.md's Measured table; the skill's budget is
// 200 KB, which leaves room for small growth and none for a regression.
const BUDGET_KB = 200
const PROBE = 'bundle-probe-value-that-must-not-ship'
const PROVIDER_HOSTS = ['generativelanguage.googleapis.com', 'api.groq.com', 'openrouter.ai/api', 'api.openai.com', 'api.anthropic.com']

const out = mkdtempSync(join(tmpdir(), 'budget-bundle-'))
try {
  // Windows Node cannot spawn .cmd without a shell; CI (Linux) uses the bare name.
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@budget/app-client', 'exec', 'vite', 'build', '--outDir', out, '--emptyOutDir'],
    {
      stdio: 'pipe',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'placeholder-public-key-for-measuring',
        VITE_BUNDLE_PROBE: PROBE,
      },
    },
  )

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
  if (first.length === 0) {
    console.log('FAIL: no entry script found in index.html')
    failed = true
  }
  const reader = first.filter((file) => readFileSync(join(out, file), 'utf8').includes('FlateDecode'))
  if (reader.length > 0) {
    console.log(`FAIL: the PDF statement reader is in the first load, in ${reader.join(', ')}`)
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
  const reached = PROVIDER_HOSTS.filter((host) => shipped.toLowerCase().includes(host))
  if (reached.length > 0 || shipped.includes('SERVICE_ROLE')) {
    console.log(`FAIL: the built JavaScript names ${[...reached, ...(shipped.includes('SERVICE_ROLE') ? ['SERVICE_ROLE'] : [])].join(', ')}`)
    failed = true
  }

  const migrations = join(import.meta.dirname, '..', 'supabase', 'migrations')
  const sources = new Map([
    ...readdirSync(migrations).filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/.test(n) && n >= '0015').map((n) => [n, join(migrations, n)]),
    ['ai-function.ts', join(import.meta.dirname, '..', 'supabase', 'functions', 'ai', 'index.ts')],
    ['read-receipt-function.ts', join(import.meta.dirname, '..', 'supabase', 'functions', 'read-receipt', 'index.ts')],
  ])
  const setup = join(out, 'setup')
  const published = existsSync(setup) ? readdirSync(setup).sort() : []
  const wanted = [...sources.keys(), 'mcp-function.ts'].sort()
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
  // Statements only: a line that starts an import or re-export, or an
  // import() call. The file keeps the engine's comments, and a comment's
  // words ("from "never set"") are not an import.
  const IMPORTS = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/gm
  if (published.includes('mcp-function.ts')) {
    const server = readFileSync(join(setup, 'mcp-function.ts'), 'utf8')
    // Nothing at all: the SDK and zod are bundled at the locked versions, so
    // no deploy resolves a version nobody reviewed (security review mcp-3-04).
    // Comment lines first: the bundled SDK's JSDoc names types as import('…').
    const statements = server.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
    const strays = [...new Set([...statements.matchAll(IMPORTS)].map((m) => m[1] ?? m[2] ?? m[3]))]
    const keys = [...PROVIDER_HOSTS, 'service_role', 'secret_keys'].filter((k) => server.toLowerCase().includes(k))
    if (!server.startsWith('// mcp-function.ts — ') || strays.length > 0 || keys.length > 0) {
      console.log(`FAIL: setup/mcp-function.ts must open with its banner, import nothing, and name no key or AI host; it imports ${strays.join(', ') || 'nothing'} and names ${keys.join(', ') || 'none'}`)
      failed = true
    }
  }
  console.log(`setup/: ${published.join(', ')}`)
  process.exitCode = failed ? 1 : 0
} finally {
  rmSync(out, { recursive: true, force: true })
}
