/**
 * Builds the AI apps server into the one file the owner pastes into
 * Supabase as the Edge Function `mcp` (ADR 0012, PLAN §2.2). Built when the
 * site is built, never committed, so the file the site offers always comes
 * from the same commit as the site.
 *
 * Everything from `packages/*` is bundled in; the SDK and zod stay imports,
 * pinned to the exact versions Deno fetches.
 *
 * This file imports no workspace package: vite loads the site's config, and
 * so this, with Node, which cannot follow a package's TypeScript sources.
 * The banner's version is read from the code it heads instead.
 */
import { fileURLToPath } from 'node:url'
import { build, type Rolldown } from 'vite'

/** The only imports the pasted file may have, by the package name each replaces. */
export const PINNED: Readonly<Record<string, string>> = {
  zod: 'npm:zod@4.6.5',
  '@modelcontextprotocol/server': 'npm:@modelcontextprotocol/server@2.2.0',
}

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
