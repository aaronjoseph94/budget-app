import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: './packages/core' } },
      { test: { name: 'money', root: './packages/money-primitives' } },
      { test: { name: 'schema', root: './packages/schema' } },
      { test: { name: 'parsers', root: './packages/statement-parsers' } },
      { test: { name: 'golden', root: './packages/golden-verification' } },
      { test: { name: 'charts', root: './packages/chart-specs' } },
      { test: { name: 'coach', root: './packages/savings-coach' } },
      { test: { name: 'export', root: './packages/report-export' } },
      { test: { name: 'ai-apps', root: './packages/ai-apps' } },
      // Split by extension: a .tsx test renders a component and needs a DOM,
      // a .ts test checks plain functions and keeps Node's faster, stricter
      // environment, where reaching for `window` by accident is an error.
      // vitest empties every stylesheet a test imports, `?raw` included; the
      // contrast test reads the colour tokens out of this one.
      // Transformed as the DOM tests are (web, not ssr): a source file both
      // projects load was otherwise compiled two ways, and coverage kept one
      // file map or the other depending on which process reported first, so
      // format.ts's branches read 153 on one run and 112 on the next.
      {
        test: {
          name: 'app',
          root: './apps/web',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          testTransformMode: { web: ['**/!(setup-files).test.ts'] },
          css: { include: [/index\.css/] },
        },
      },
      { test: { name: 'app-dom', root: './apps/web', include: ['test/**/*.test.tsx'], environment: 'jsdom' } },
      // The Edge Functions import zod by Deno's pinned URL so each can be
      // pasted alone; here that name is the package's own zod, as in its
      // tsconfig.
      {
        test: { name: 'functions', root: './supabase/functions' },
        resolve: { alias: { 'npm:zod@4.6.5': 'zod' } },
      },
    ],
    coverage: {
      provider: 'v8',
      // Source only. `tsc --build` emits a parallel copy of every module into
      // dist/, which no test imports; counting it reported 36% overall while
      // the code the tests actually exercise was above 90%.
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}', 'supabase/functions/**/index.ts'],
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
        'packages/chart-specs/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/savings-coach/src/**': { lines: 80, functions: 80, branches: 75 },
        'packages/report-export/src/**': { lines: 80, functions: 80, branches: 75 },
        // The AI apps server (ADR 0012): what an outside AI app may reach.
        'packages/ai-apps/src/**': { lines: 80, functions: 80, branches: 75 },
        // The code that holds a provider key is held to the same bar.
        'supabase/functions/**': { lines: 80, functions: 80, branches: 75 },
        // The app as a whole, .tsx included, now held to the bar every module
        // has (N5): measured 86.6 / 88.9 / 91.1 on 2026-09-23 once every
        // screen had tests. The files held to their own figures below keep
        // the whole-app number from hiding one of them slipping.
        'apps/web/src/**': { lines: 80, functions: 80, branches: 75 },
        'apps/web/src/format.ts': { lines: 80, functions: 80, branches: 75 },
        'apps/web/src/screens/WeekScreen.tsx': { lines: 95, functions: 100, branches: 76 },
        'apps/web/src/screens/ReviewScreen.tsx': { lines: 95, functions: 100, branches: 87 },
      },
    },
  },
})
