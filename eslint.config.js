import tseslint from 'typescript-eslint'

/** Ambient state that makes a pure function impure and a golden replay unreliable. */
const NO_AMBIENT_STATE = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "No ambient clock in packages/core. Time enters as an explicit `asOf` parameter.",
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "No ambient clock in packages/core. Time enters as an explicit `asOf` parameter.",
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'No randomness in packages/core — it would make the golden replay non-reproducible.',
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'No ambient config in packages/core. Configuration is a parameter.',
  },
]

const NO_FLOAT_MONEY = [
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'toFixed produces a float-formatted string. Money is integer Cents; format only in the UI helper.',
  },
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'parseFloat produces a float. Parse money to integer minor units instead.',
  },
]

const NO_WEAK_ASSERTIONS = [
  {
    selector: "CallExpression[callee.property.name='toBeCloseTo']",
    message: 'CONSTRAINTS.md: zero tolerance on money and dates. Assert exact values.',
  },
  {
    selector: "CallExpression[callee.property.name=/^toMatchSnapshot$|^toMatchInlineSnapshot$/]",
    message: 'Snapshots on derived money hide changes instead of catching them.',
  },
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
    message: 'No mocks in packages/core. If a test here needs a double, the purity boundary is already broken.',
  },
]

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts', 'packages/money-primitives/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_AMBIENT_STATE, ...NO_FLOAT_MONEY],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'expo', 'expo-*', '@expo/*'], message: 'packages/core is pure: no UI.' },
            { group: ['@supabase/*'], message: 'packages/core is pure: no database.' },
            { group: ['node:*', 'fs', 'path', 'os'], message: 'packages/core is pure: no I/O.' },
            { group: ['zod'], message: 'packages/core must not depend on zod — see CAPABILITY-MAP.md.' },
          ],
        },
      ],
    },
  },
  {
    // schema-contracts is allowed zod — it owns it — but money is still integer
    // Cents here, and the engine stays on the other side of the boundary.
    files: ['packages/schema/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_FLOAT_MONEY],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@budget/core', '@budget/core/*'], message: 'schema-contracts must not depend on the engine — see CAPABILITY-MAP.md.' },
            { group: ['react', 'react-*'], message: 'schema-contracts is not a UI module.' },
            { group: ['@supabase/*'], message: 'schema-contracts describes rows; it does not fetch them.' },
          ],
        },
      ],
    },
  },
  {
    // Parsers read money out of text, so the float rules apply in full. The
    // engine stays on the other side of the boundary.
    files: ['packages/statement-parsers/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_FLOAT_MONEY],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@budget/core', '@budget/core/*'], message: 'statement-parsers must not depend on the engine — see CAPABILITY-MAP.md.' },
            { group: ['react', 'react-*'], message: 'statement-parsers is not a UI module.' },
            { group: ['@supabase/*'], message: 'statement-parsers takes bytes, not a database.' },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/core/test/**/*.ts',
      'packages/schema/test/**/*.ts',
      'packages/statement-parsers/test/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...NO_WEAK_ASSERTIONS] },
  },
)
