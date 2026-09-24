import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // This machine only. `host: true` served the dev app, and any file Vite
  // may read in the workspace, to everyone on the same Wi-Fi (SEC-7). For a
  // deliberate test on a phone on a trusted network: `pnpm dev --host`.
  server: { port: 5173 },
})
