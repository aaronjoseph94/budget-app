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
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
  },
}
