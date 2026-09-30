/**
 * The one-time updates, copied into the site under /setup/ (ADR 0007).
 *
 * Help → One-time updates has a Copy button beside the next file to paste
 * into Supabase. The file is fetched from the site itself, so this plugin
 * puts exactly the committed files there, byte for byte, and nothing else:
 * every migration numbered 0015 or later (the owner pasted 0001–0014 on
 * 2026-09-24), the AI helper's source as ai-function.ts, and read-receipt's
 * as read-receipt-function.ts (the MCP plan's M1b). Nothing from
 * the environment is read. The list is worked out from the folder, so a
 * new migration joins when it is committed.
 *
 * The files are public on the site. They hold no secret (gitleaks scans them
 * where they are committed), and row-level security, not an unknown schema,
 * is what keeps each person's rows their own.
 */
import { readFileSync, readdirSync } from 'node:fs'
import type { Plugin } from 'vite'

const REPO = new URL('../../', import.meta.url)
const MIGRATION = /^(\d{4})_[a-z0-9_]+\.sql$/
/** The first update the Copy buttons carry. */
const FIRST_COPIED = 15

/** Each file the site serves under /setup/, by its name there, and where it is committed. */
export function setupFiles(repo: URL = REPO): ReadonlyMap<string, URL> {
  const folder = new URL('supabase/migrations/', repo)
  const migrations = readdirSync(folder)
    .filter((name) => Number(MIGRATION.exec(name)?.[1] ?? 0) >= FIRST_COPIED)
    .sort()
  return new Map([
    ...migrations.map((name): [string, URL] => [name, new URL(name, folder)]),
    ['ai-function.ts', new URL('supabase/functions/ai/index.ts', repo)],
    ['read-receipt-function.ts', new URL('supabase/functions/read-receipt/index.ts', repo)],
  ])
}

/**
 * What the dev server answers for a path: a listed file's bytes, a 404 for
 * anything else under /setup/ (so it never falls through to the app's own
 * page, or to a file Vite may read), or null for a path that is not its.
 */
export function serveSetup(url: string, files = setupFiles()): { status: 200 | 404; body: Buffer | null } | null {
  const path = url.split(/[?#]/)[0] ?? ''
  if (!path.startsWith('/setup/')) return null
  const source = files.get(path.slice('/setup/'.length))
  return source === undefined ? { status: 404, body: null } : { status: 200, body: readFileSync(source) }
}

export function setupFilesPlugin(): Plugin {
  return {
    name: 'budget-setup-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const answer = serveSetup(req.url ?? '')
        if (answer === null) return next()
        res.statusCode = answer.status
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(answer.body ?? '')
      })
    },
    generateBundle() {
      for (const [name, source] of setupFiles()) {
        this.emitFile({ type: 'asset', fileName: `setup/${name}`, source: readFileSync(source) })
      }
    },
  }
}
