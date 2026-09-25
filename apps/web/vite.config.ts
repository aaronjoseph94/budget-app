import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { setupFilesPlugin } from './setup-files.js'

export default defineConfig({
  // The one-time updates the Copy buttons fetch, under /setup/ (ADR 0007).
  plugins: [react(), tailwindcss(), setupFilesPlugin()],
  // This machine only. `host: true` served the dev app, and any file Vite
  // may read in the workspace, to everyone on the same Wi-Fi (SEC-7). For a
  // deliberate test on a phone on a trusted network: `pnpm dev --host`.
  server: { port: 5173 },
})
