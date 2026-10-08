import { fileURLToPath } from 'node:url'
import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'

/**
 * The browser suite (docs/design/rework/04-e2e.md): `pnpm e2e`.
 *
 * Every step is exact. No model is configured, so a test never takes
 * `agent`; `screen` drives by role and name, `expect` judges. The app is
 * apps/web on the fake Supabase in apps/web/e2e, which the runner starts
 * here on its fixed port; both targets share the one server.
 *
 * Two targets: a phone's width in WebKit, the engine an iPhone draws
 * with, and a desktop's in Chromium. @e2e-dev/web sets a viewport and a
 * user agent only. It cannot emulate touch, a coarse pointer or a dark
 * colour scheme (its own stated limits), so those stay untested here;
 * the colour tokens of both schemes are checked by contrast.test.ts.
 */
const app = {
  url: 'http://127.0.0.1:5275',
  command: {
    executable: 'pnpm',
    args: ['exec', 'vite', '--config', 'e2e/vite.preview.config.ts'],
    cwd: fileURLToPath(new URL('./apps/web/', import.meta.url)),
    // Invented: the stand-in answers in memory, so nothing reaches a real project.
    env: { VITE_SUPABASE_URL: 'https://invented.supabase.co', VITE_SUPABASE_ANON_KEY: 'invented-anon-key-for-preview-only' },
    startupTimeout: 120_000,
    log: '.e2e/logs/app.log',
  },
}

/** An iPhone's own user agent, so the app reads the phone it is drawn for. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

export default {
  targets: [
    { name: 'phone', engine: web({ browser: 'webkit', viewport: { width: 390, height: 844 }, userAgent: IPHONE }), app },
    { name: 'desktop', engine: web({ viewport: { width: 1440, height: 900 } }), app },
  ],
  // A trace of a failed attempt only: one for every attempt doubles the run.
  trace: 'retain-on-failure',
} satisfies E2EConfig
