import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: './packages/core' } },
      { test: { name: 'money', root: './packages/money-primitives' } },
      { test: { name: 'schema', root: './packages/schema' } },
      { test: { name: 'parsers', root: './packages/statement-parsers' } },
      { test: { name: 'golden', root: './packages/golden-verification' } },
      { test: { name: 'app', root: './apps/web' } },
    ],
    coverage: {
      provider: 'v8',
      // Source only. `tsc --build` emits a parallel copy of every module into
      // dist/, which no test imports; counting it reported 36% overall while
      // the code the tests actually exercise was above 90%.
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/dist/**'],
      reporter: ['text-summary'],
      // Aggregated per module rather than per file, because a barrel that only
      // re-exports reads as 0% covered however well its exports are tested.
      thresholds: {
        'packages/core/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/schema/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/money-primitives/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/statement-parsers/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/golden-verification/src/**': { lines: 80, functions: 80, branches: 75 },
        // format.ts only: the screens are covered by the Playwright run, not here.
        'apps/web/src/format.ts': { lines: 80, functions: 80, branches: 75 },
      },
    },
  },
})
