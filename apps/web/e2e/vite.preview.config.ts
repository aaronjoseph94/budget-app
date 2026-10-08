import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { setupFilesPlugin } from '../setup-files.js'

/**
 * The browser suite's app (docs/design/rework/04-e2e.md): the web app as
 * Vite serves it, with supabase-preview.ts in place of the real client,
 * so every screen draws invented data and no request leaves the page.
 * e2e.config.ts at the repository root starts it; start.sh serves the
 * same by hand. The port is fixed, so the suite's address is one string.
 *
 * Only `./supabase.js` is swapped: that is App.tsx's import of the
 * client. A `../supabase.js` import from a folder below src reaches the
 * real module, whose non-client exports the stand-in mirrors.
 */
const here = fileURLToPath(new URL('./', import.meta.url))
const web = fileURLToPath(new URL('../', import.meta.url))
const repo = fileURLToPath(new URL('../../../', import.meta.url))

export default defineConfig({
  root: web,
  plugins: [react(), tailwindcss(), setupFilesPlugin()],
  resolve: { alias: [{ find: /^\.\/supabase\.js$/, replacement: `${here}supabase-preview.ts` }] },
  // 127.0.0.1, the address e2e.config.ts waits on, not Vite's default
  // `localhost`: on GitHub's runner that name is ::1 first, so Vite listened
  // on IPv6 alone and every CI run ended APP_UNREACHABLE before a test ran.
  server: { host: '127.0.0.1', port: 5275, strictPort: true, fs: { allow: [repo] } },
})
