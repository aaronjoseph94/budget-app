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
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
  },
}
