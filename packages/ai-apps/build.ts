/**
 * Builds the AI apps server into the one file the owner pastes into
 * Supabase as the Edge Function `mcp` (ADR 0012, PLAN §2.2). Built when the
 * site is built, never committed, so the file the site offers always comes
 * from the same commit as the site.
 *
 * Everything is bundled in: `packages/*`, and the SDK and zod at the exact
 * versions in pnpm-lock.yaml, resolved as Deno would (`deno`, `node`,
 * `import`). The file imports nothing, so a deploy fetches nothing nobody
 * reviewed: before, the SDK's own `zod ^4.2.0` was resolved afresh at each
 * paste, outside the lockfile and `pnpm audit` (security review mcp-3-04).
 * About 1.2 MB, unminified so it can still be read.
 *
 * This file imports no workspace package: vite loads the site's config, and
 * so this, with Node, which cannot follow a package's TypeScript sources.
 * The banner's version is read from the code it heads instead.
 */
import { fileURLToPath } from 'node:url'
import { build, type Rolldown } from 'vite'

/** The imports the pasted file may have, by the package name each replaces: none (mcp-3-04). */
export const PINNED: Readonly<Record<string, string>> = {}

export const banner = (version: string) =>
  `// mcp-function.ts — the budget app's AI apps server, version ${version}. Built from packages/ai-apps; paste it whole as the Edge Function "mcp".`

export async function bundleMcpFunction(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [
      {
        name: 'budget-pin-npm',
        enforce: 'pre',
        resolveId: (id: string) => (id in PINNED ? { id: PINNED[id] as string, external: true } : null),
      },
    ],
    resolve: { conditions: ['deno', 'node', 'import'] },
    build: {
      write: false,
      minify: false,
      copyPublicDir: false,
      target: 'es2022',
      lib: { entry: fileURLToPath(new URL('src/deno.ts', import.meta.url)), formats: ['es'], fileName: 'mcp-function' },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  const chunks = outputs.flatMap((o) => o.output).filter((c) => c.type === 'chunk')
  if (chunks.length !== 1 || chunks[0] === undefined) throw new Error(`expected one chunk, got ${chunks.length}`)
  const code = chunks[0].code
  const version = /\bMCP_SERVER_VERSION = "([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)"/.exec(code)?.[1]
  if (version === undefined) throw new Error('the built server names no MCP_SERVER_VERSION')
  return `${banner(version)}\n${code}`
}
