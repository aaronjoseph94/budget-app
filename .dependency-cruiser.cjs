/** Enforces the module boundaries in CAPABILITY-MAP.md. */
module.exports = {
  forbidden: [
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'packages/core is the calculation engine. It may depend only on money-primitives. ' +
        'Its purity is what makes the golden replay trustworthy.',
      from: { path: '^packages/core/src' },
      to: {
        pathNot: [
          '^packages/core/src',
          '^packages/money-primitives',
          'node_modules/typescript/lib',
        ],
      },
    },
    {
      name: 'money-primitives-is-the-root',
      severity: 'error',
      comment: 'money-primitives has no dependencies. It is the root of the graph.',
      from: { path: '^packages/money-primitives/src' },
      to: { pathNot: ['^packages/money-primitives/src'] },
    },
    {
      name: 'schema-never-imports-the-engine',
      severity: 'error',
      comment:
        'packages/schema owns the zod contracts and may depend only on money-primitives. ' +
        'The engine must not see zod and zod must not see the engine; both need the money ' +
        'type, so it lives below them. Either arrow here makes that a cycle.',
      from: { path: '^packages/schema/src' },
      // zod resolves through pnpm's content-addressed store, so its path is
      // `node_modules/.pnpm/zod@x.y.z/node_modules/zod/...` and cannot be anchored.
      to: {
        pathNot: ['^packages/schema/src', '^packages/money-primitives', 'node_modules/zod/'],
      },
    },
    {
      name: 'parsers-stay-below-the-engine',
      severity: 'error',
      comment:
        'statement-parsers turns bytes into validated rows. It may use money-primitives ' +
        'and the zod contracts, never the engine: a parser that can compute a total will ' +
        'eventually compute one, and invariant 1 puts all arithmetic in packages/core.',
      from: { path: '^packages/statement-parsers/src' },
      to: {
        pathNot: [
          '^packages/statement-parsers/src',
          '^packages/money-primitives',
          '^packages/schema/src',
          'node_modules/zod/',
        ],
      },
    },
    {
      name: 'charts-draw-what-the-engine-computed',
      severity: 'error',
      comment:
        'chart-specs turns the engine\'s basis points into geometry. It may name the ' +
        'engine\'s types to describe what it is given, and use money-primitives; it may ' +
        'not call the engine, or anything else. A chart that can compute a share will ' +
        'one day compute a different one from the screen beside it (invariant 1).',
      from: { path: '^packages/chart-specs/src' },
      to: {
        pathNot: ['^packages/chart-specs/src', '^packages/money-primitives/src'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'coach-words-what-the-engine-computed',
      severity: 'error',
      comment:
        'savings-coach turns the engine\'s facts into words and cards. It may call the ' +
        'engine; it may name schema\'s and money-primitives\' types, never call them, so ' +
        'no sum, parse or rounding happens here; and it may reach nothing else (ADR 0005).',
      from: { path: '^packages/savings-coach/src' },
      to: {
        pathNot: ['^packages/savings-coach/src', '^packages/core/src'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'app-uses-package-entry-points-only',
      severity: 'error',
      comment:
        'The UI consumes a package through its public API, never by reaching into its ' +
        'files. A deep import binds the screen to an internal name that carries no ' +
        'promise, so a refactor inside a package silently becomes a UI change — and ' +
        'the package index is where each layer states what it is willing to support.',
      from: { path: '^apps/web/src' },
      to: {
        path: '^packages/[^/]+/src/',
        pathNot: '^packages/[^/]+/src/index\\.ts$',
      },
    },
    {
      name: 'ui-never-computes-money',
      severity: 'error',
      comment:
        'Invariant 1, made mechanical. money-primitives exports addCents, subCents, ' +
        'sumCents and accrueMonthlyInterest; a component holding those is one line ' +
        'away from adding up a column itself, and a total computed in a screen is a ' +
        'second place for a figure to be wrong — the one the user actually reads. ' +
        'The TYPE is allowed: naming a value Cents costs nothing and prevents a float. ' +
        'The functions are not. Totals come from packages/core or they do not exist.',
      from: { path: '^apps/web/src' },
      to: {
        path: '^packages/money-primitives',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'packages-never-import-the-app',
      severity: 'error',
      comment:
        'The arrow only points one way. A package importing a screen would make the ' +
        'engine depend on React, and would put a component inside the graph the ' +
        'golden replay is supposed to be able to run without a browser.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'functions-stay-pasteable',
      severity: 'error',
      comment:
        'Each Edge Function is pasted into the Supabase dashboard as one file, so it may ' +
        'import zod by its pinned URL and nothing else: not a sibling, not a package. An ' +
        'import that works here would be missing there, and the function would not start.',
      from: { path: '^supabase/functions/[^/]+/index\\.ts$' },
      to: { pathNot: 'node_modules/zod/' },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        'An import that does not resolve is invisible to every path-based rule above: ' +
        'it is recorded under its bare specifier, so a forbidden cross-package import ' +
        'would slip through as "unresolved" rather than as a violation.',
      from: {},
      to: { couldNotResolve: true },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  // Deny by default. The rules above name what each module may NOT reach, so
  // a package they do not mention was governed by nothing: golden-verification
  // could have imported the engine it grades, and a new package started life
  // with no boundary at all. Every dependency must now match one line below or
  // it is a `not-in-allowed` error, so a new package or a new arrow is refused
  // until someone writes down that it is meant. The forbidden rules stay for
  // their messages, which say why.
  allowedSeverity: 'error',
  allowed: [
    // Within a module. Tests read their own source, helpers and fixtures;
    // source never reads its tests.
    { from: { path: '^(packages|apps)/([^/]+)/src/' }, to: { path: '^$1/$2/src/' } },
    { from: { path: '^(packages|apps)/([^/]+)/test/' }, to: { path: '^$1/$2/(src|test|fixtures)/' } },
    // The app's tests may read, as text, what the hosts serve beside the
    // bundle: the headers each host sends are checked against each other and
    // against the Supabase project the build names. Nothing that ships may.
    { from: { path: '^apps/web/test/' }, to: { path: ['^apps/web/public/', '^netlify\\.toml$'] } },
    // Tests run under vitest, screens under Testing Library, and a test or
    // the fixture loader may read files; nothing that ships may.
    {
      from: { path: '^(packages|apps)/[^/]+/test/' },
      to: { path: 'node_modules/(vitest|@testing-library/[^/]+)/' },
    },
    { from: { path: '^(packages/[^/]+/test/|packages/golden-verification/src/)' }, to: { dependencyTypes: ['core'] } },
    // The graph in CAPABILITY-MAP.md. money-primitives has no line: it is the root.
    { from: { path: '^packages/core/' }, to: { path: '^packages/money-primitives/src/' } },
    { from: { path: '^packages/core/test/' }, to: { path: '^packages/golden-verification/src/' } },
    { from: { path: '^packages/schema/' }, to: { path: ['^packages/money-primitives/src/', 'node_modules/zod/'] } },
    {
      from: { path: '^packages/statement-parsers/' },
      to: { path: ['^packages/money-primitives/src/', '^packages/schema/src/', 'node_modules/zod/'] },
    },
    { from: { path: '^packages/chart-specs/' }, to: { path: '^packages/money-primitives/src/' } },
    { from: { path: '^packages/chart-specs/' }, to: { path: '^packages/core/src/', dependencyTypes: ['type-only'] } },
    { from: { path: '^packages/savings-coach/' }, to: { path: '^packages/core/src/' } },
    {
      from: { path: '^packages/savings-coach/' },
      to: { path: ['^packages/(schema|money-primitives)/src/'], dependencyTypes: ['type-only'] },
    },
    // The app, and the libraries its package.json names. Which of the
    // packages' exports it may use is the forbidden rules' business above.
    {
      from: { path: '^apps/web/(src|test)/' },
      to: {
        path: [
          '^packages/(money-primitives|core|schema|statement-parsers|chart-specs|savings-coach)/src/',
          'node_modules/(react|react-dom|zod|@supabase/supabase-js)/',
        ],
      },
    },
    // The Edge Functions: zod alone in the source (the rule above says why).
    // Their tests may read the function, vitest, Node's own modules, and the
    // app's parser for what a function passes on, so the two cannot drift.
    { from: { path: '^supabase/functions/[^/]+/index\\.ts$' }, to: { path: 'node_modules/zod/' } },
    {
      from: { path: '^supabase/functions/test/' },
      to: { path: ['^supabase/functions/[^/]+/index\\.ts$', 'node_modules/vitest/', '^packages/schema/src/'] },
    },
    { from: { path: '^supabase/functions/test/' }, to: { dependencyTypes: ['core'] } },
    // Build configuration beside the app: Vite and its plugins, never the app.
    {
      from: { path: '^apps/web/[^/]+\\.ts$' },
      to: { path: 'node_modules/(vite|@vitejs/plugin-react|@tailwindcss/vite)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    webpackConfig: { fileName: '.dependency-cruiser.resolve.cjs' },
    tsPreCompilationDeps: true,
    // Generated declaration output. It mirrors src, so leaving it in means
    // every rule is evaluated twice and every violation reported twice — and
    // its `./index.css` import is unresolvable by construction, since tsc does
    // not emit the stylesheet Vite handles. Anchored to this repository's own
    // folders: unanchored, it also dropped every import that resolves into a
    // library's dist/ — supabase-js, vitest, vite — so those arrows were
    // invisible to every rule, and a package importing one read as clean.
    exclude: { path: '^(packages|apps|supabase)/[^/]+/(dist|dist-types|coverage)/' },
    // vite and its plugins are ESM-only and describe themselves with an
    // `exports` map. Without the import condition, resolution falls back to a
    // `main` that is not there and vite.config.ts reads as unresolvable —
    // which `no-unresolvable` then reports, correctly by its own lights and
    // uselessly, since the package is present and the file is build tooling
    // outside the runtime graph. Naming the conditions fixes the resolution
    // rather than exempting the file, so the rule keeps its teeth.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.d.ts'],
    },
  },
}
