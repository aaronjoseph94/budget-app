import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: './packages/core' } },
      { test: { name: 'money', root: './packages/money-primitives' } },
    ],
  },
})
