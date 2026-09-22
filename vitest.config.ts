import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: './packages/core' } },
      { test: { name: 'money', root: './packages/money-primitives' } },
      { test: { name: 'schema', root: './packages/schema' } },
      { test: { name: 'parsers', root: './packages/statement-parsers' } },
      { test: { name: 'golden', root: './packages/golden-verification' } },
      // Split by extension: a .tsx test renders a component and needs a DOM,
      // a .ts test checks plain functions and keeps Node's faster, stricter
      // environment, where reaching for `window` by accident is an error.
      { test: { name: 'app', root: './apps/web', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'app-dom', root: './apps/web', include: ['test/**/*.test.tsx'], environment: 'jsdom' } },
    ],
    coverage: {
      provider: 'v8',
      // Source only. `tsc --build` emits a parallel copy of every module into
      // dist/, which no test imports; counting it reported 36% overall while
      // the code the tests actually exercise was above 90%.
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}'],
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
        // The app as a whole, .tsx included, floored at what the screen tests
        // measure today (rounded down). It sits under the 80/80/75 bar because
        // Add, Import, Ledger, Settings and sign-in have no tests yet
        // (NOTICED N5); it only moves up. The files that do have tests are held
        // to their own figures so the whole-app number cannot hide them slipping.
        'apps/web/src/**': { lines: 31, functions: 71, branches: 78 },
        'apps/web/src/format.ts': { lines: 80, functions: 80, branches: 75 },
        'apps/web/src/screens/WeekScreen.tsx': { lines: 95, functions: 100, branches: 76 },
        'apps/web/src/screens/ReviewScreen.tsx': { lines: 95, functions: 100, branches: 87 },
      },
    },
  },
})
