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
  {
    // CONSTRAINTS.md's Floor forbids `eslint-disable`, but nothing enforced it:
    // every gate whose mechanism is eslint — Engine purity, Float money, Weak
    // assertions — could be switched off for a file by one comment, and the
    // gate would still report PASS. These are syntax rules, so depcruise cannot
    // cover them either. `noInlineConfig` makes such a comment inert rather
    // than trusted; `reportUnusedDisableDirectives` then makes writing one an
    // error in its own right, so it fails loudly instead of doing nothing.
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
  },
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
    // chart-specs is pure as the engine is: the same figure must come out for
    // the phone, the PDF and the export, which ambient state would break. It
    // turns basis points into geometry and never touches money, so the float
    // rules apply in full. The engine's types describe what it is given; the
    // engine's functions stay out, so no chart can compute its own figure.
    files: ['packages/chart-specs/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // The engine's messages, naming this package, so a failure points at
        // the file it is in.
        ...NO_AMBIENT_STATE.map((rule) => ({ ...rule, message: rule.message.replace('packages/core', 'chart-specs') })),
        ...NO_FLOAT_MONEY,
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'DOMParser', 'XMLSerializer'].map((name) => ({
          name,
          message: 'chart-specs returns strings and has no DOM; the app puts them on the page.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*'], message: 'chart-specs returns SVG strings, not components.' },
            { group: ['@supabase/*'], message: 'chart-specs is pure: no database.' },
            { group: ['node:*', 'fs', 'path', 'os'], message: 'chart-specs is pure: no I/O.' },
            { group: ['zod'], message: 'chart-specs takes validated values; zod parses at the boundaries only.' },
            {
              group: ['@budget/core', '@budget/core/*'],
              allowTypeImports: true,
              message: 'chart-specs may use the engine\'s types, never its functions — see CAPABILITY-MAP.md.',
            },
            {
              group: ['@budget/schema', '@budget/statement-parsers', '@budget/golden-verification'],
              message: 'chart-specs may depend on money-primitives and the engine\'s types only.',
            },
          ],
        },
      ],
    },
  },
  {
    // Text a person typed or a statement carried is never markup (CLAUDE.md).
    // The one string the app may put into the page as markup is a chart from
    // chart-specs, which escapes as it builds; components/ui/chart.tsx is the
    // only place that does it, and nothing may pass a string off as one.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/components/ui/chart.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Markup from a string only through SvgChart (components/ui/chart.tsx), and only from chart-specs.',
        },
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='SvgMarkup']",
          message: 'Only chart-specs makes SvgMarkup; a string cast to it would be injected unescaped.',
        },
        {
          selector: "TSTypeAssertion[typeAnnotation.typeName.name='SvgMarkup']",
          message: 'Only chart-specs makes SvgMarkup; a string cast to it would be injected unescaped.',
        },
        // The DOM's own ways to parse a string as markup, which bypass React.
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: 'Markup from a string only through SvgChart (components/ui/chart.tsx), and only from chart-specs.',
        },
        {
          selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|setHTMLUnsafe)$/]",
          message: 'Markup from a string only through SvgChart (components/ui/chart.tsx), and only from chart-specs.',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
          message: 'Markup from a string only through SvgChart (components/ui/chart.tsx), and only from chart-specs.',
        },
      ],
    },
  },
  {
    files: [
      'packages/core/test/**/*.ts',
      'packages/schema/test/**/*.ts',
      'packages/statement-parsers/test/**/*.ts',
      'packages/chart-specs/test/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...NO_WEAK_ASSERTIONS] },
  },
)
