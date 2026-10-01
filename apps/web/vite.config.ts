import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { setupFilesPlugin } from './setup-files.js'
import { refuseSecretKey } from './src/public-key.js'

export default defineConfig(({ mode }) => {
  // Before anything is built: a secret or service_role key named as the
  // public one would be compiled into the published JavaScript, and an
  // old deployment stays reachable after a fix (security-c2-02). loadEnv
  // reads .env files and the process environment, as Cloudflare sets it.
  refuseSecretKey(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
    // The one-time updates the Copy buttons fetch, under /setup/ (ADR 0007).
    plugins: [react(), tailwindcss(), setupFilesPlugin()],
    // This machine only. `host: true` served the dev app, and any file Vite
    // may read in the workspace, to everyone on the same Wi-Fi (SEC-7). For a
    // deliberate test on a phone on a trusted network: `pnpm dev --host`.
    server: { port: 5173 },
  }
})
