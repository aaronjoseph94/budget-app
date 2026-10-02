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
  // The device's language and time zone are ambient state too: the same
  // input must give the same answer on every phone (architecture-a-03).
  {
    selector: "CallExpression[callee.property.name='localeCompare'][arguments.length<2]",
    message: "No device locale in packages/core: a bare localeCompare orders by the phone's language. Use byName (core's order.ts).",
  },
  {
    selector: "CallExpression[callee.property.name=/^(toLocaleString|toLocaleDateString|toLocaleTimeString|toLocaleUpperCase|toLocaleLowerCase|getTimezoneOffset)$/]",
    message: "No device locale or time zone in packages/core. Dates are IsoDate strings; words are formatted in the app.",
  },
  // money-primitives keeps Date for its calendar, in UTC only: a local
  // getter, `Date()` or a parsed date-time string reads the device's zone.
  {
    selector: "CallExpression[callee.property.name=/^(getDate|getDay|getMonth|getFullYear|getHours|getMinutes)$/]",
    message: 'No device time zone in packages/core: use the UTC getters (getUTCDate, ...).',
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: 'Date() is the device clock as text. Time enters as an explicit `asOf` parameter.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type=/^(Literal|TemplateLiteral)$/]",
    message: "A date string parsed by Date can read as the device's local time. Build it with Date.UTC.",
  },
]

/**
 * Globals that reach outside a pure function: a clock, randomness, a
 * locale, the network, timers, storage or the host (architecture-a-03).
 * The syntax rules above catch four spellings; these catch the rest
 * (`Date()`, `globalThis.Date.now()`, `performance.now()`, `fetch`, ...).
 */
const AMBIENT_GLOBALS = [
  'Date', 'performance', 'crypto', 'Intl', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'setTimeout', 'setInterval', 'queueMicrotask', 'localStorage', 'sessionStorage', 'indexedDB',
  'navigator', 'process',
]
/** no-restricted-globals entries for AMBIENT_GLOBALS, less `except` (allowed, or already listed). */
const ambientGlobals = (where, except = []) =>
  AMBIENT_GLOBALS.filter((name) => !except.includes(name)).map((name) => ({
    name,
    message: `${where} is pure: no clock, locale, network, timer, storage or host. Pass what is needed in.`,
  }))

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

/**
 * CONSTRAINTS.md's Floor, which said "always enforced" and was checked by
 * nothing (architecture-a-07): no silent numeric fallback (`?? 0`, `|| 0`,
 * `?? ZERO_CENTS`, `?? cents(…)`), no `as unknown as`, no "not implemented"
 * stub. A $0 balance is a legitimate value; missing data fails loudly.
 */
const NO_SILENT_FALLBACK = [
  {
    selector: "LogicalExpression[operator=/^(\\?\\?|\\|\\|)$/][right.type='Literal'][right.value=0]",
    message: 'No silent numeric fallback (CONSTRAINTS.md Floor): missing data fails loudly, it is never 0.',
  },
  {
    selector: "LogicalExpression[operator='??'][right.name='ZERO_CENTS']",
    message: 'No silent numeric fallback (CONSTRAINTS.md Floor): a missing amount is not $0. Branch on it.',
  },
  {
    selector: "LogicalExpression[operator='??'][right.callee.name='cents']",
    message: 'No silent numeric fallback (CONSTRAINTS.md Floor): a missing amount is not an amount. Branch on it.',
  },
  {
    selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message: 'No `as unknown as` (CONSTRAINTS.md Floor): parse or narrow the value instead.',
  },
  {
    selector: "NewExpression[callee.name='Error'][arguments.0.value=/not implemented/i]",
    message: 'No unimplemented stubs (CONSTRAINTS.md Floor).',
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
  // docs/design holds design references handed over as built files (their
  // support.js is a generated runtime): read by people, never imported, never
  // shipped. The app's own code is linted exactly as before.
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'docs/design/**'] },
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
      'no-restricted-syntax': ['error', ...NO_AMBIENT_STATE, ...NO_FLOAT_MONEY, ...NO_SILENT_FALLBACK],
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
    // money-primitives keeps Date for its UTC calendar helpers; the engine
    // has no use for any of these. order.ts alone names a locale, English,
    // so that names sort the same on every device (F53).
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/order.ts'],
    rules: { 'no-restricted-globals': ['error', ...ambientGlobals('packages/core')] },
  },
  {
    files: ['packages/core/src/order.ts'],
    rules: { 'no-restricted-globals': ['error', ...ambientGlobals('packages/core', ['Intl'])] },
  },
  {
    // The Floor's "no empty catch" (architecture-a-07): a swallowed error
    // is a failure that ends nowhere. The AI apps server is the MCP build's.
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/ai-apps/**'],
    rules: { 'no-empty': ['error', { allowEmptyCatch: false }] },
  },
  {
    // schema-contracts is allowed zod — it owns it — but money is still integer
    // Cents here, and the engine stays on the other side of the boundary.
    files: ['packages/schema/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_FLOAT_MONEY, ...NO_SILENT_FALLBACK],
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
      // The dedupe hash is only an identity if the same file always reads
      // the same way, so the engine's purity holds here too.
      'no-restricted-syntax': [
        'error',
        ...NO_AMBIENT_STATE.map((rule) => ({ ...rule, message: rule.message.replace('packages/core', 'statement-parsers') })),
        ...NO_FLOAT_MONEY,
        ...NO_SILENT_FALLBACK,
      ],
      'no-restricted-globals': ['error', ...ambientGlobals('statement-parsers')],
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
    // The dedupe hash is SHA-256 by Web Crypto, the one global it needs.
    files: ['packages/statement-parsers/src/dedupe.ts'],
    rules: { 'no-restricted-globals': ['error', ...ambientGlobals('statement-parsers', ['crypto'])] },
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
        ...NO_SILENT_FALLBACK,
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'DOMParser', 'XMLSerializer'].map((name) => ({
          name,
          message: 'chart-specs returns strings and has no DOM; the app puts them on the page.',
        })),
        ...ambientGlobals('chart-specs', ['window', 'document', 'navigator', 'DOMParser', 'XMLSerializer']),
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
    // savings-coach is pure as chart-specs is (CAPABILITY-MAP.md): the same
    // facts must give the same cards on the phone and in a test, which a
    // clock, randomness or a network would break. It may call the engine,
    // whose figures it words; schema and money-primitives it may name as
    // types only, so no sum and no parse happens here. The app hashes, reads
    // and writes; zod parses at the boundaries only.
    files: ['packages/savings-coach/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_AMBIENT_STATE.map((rule) => ({ ...rule, message: rule.message.replace('packages/core', 'savings-coach') })),
        ...NO_FLOAT_MONEY,
        ...NO_SILENT_FALLBACK,
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'crypto', 'fetch', 'localStorage', 'DOMParser'].map((name) => ({
          name,
          message: 'savings-coach is pure: the app reads, writes, hashes and calls.',
        })),
        ...ambientGlobals('savings-coach', ['window', 'document', 'navigator', 'crypto', 'fetch', 'localStorage', 'DOMParser']),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*'], message: 'savings-coach returns words and cards, not components.' },
            { group: ['@supabase/*'], message: 'savings-coach is pure: no database.' },
            { group: ['node:*', 'fs', 'path', 'os', 'crypto'], message: 'savings-coach is pure: no I/O and no hashing.' },
            { group: ['zod'], message: 'savings-coach takes validated values; zod parses at the boundaries only.' },
            {
              group: ['@budget/schema', '@budget/money-primitives'],
              allowTypeImports: true,
              message: 'savings-coach may name these types, never call them: the engine does the arithmetic.',
            },
            {
              group: ['@budget/statement-parsers', '@budget/golden-verification', '@budget/chart-specs'],
              message: 'savings-coach may depend on the engine, and on schema and money-primitives as types only.',
            },
          ],
        },
      ],
    },
  },
  {
    // report-export turns rows of text into a file and nothing more
    // (CAPABILITY-MAP.md): the app formats every figure, and the app makes the
    // download. So no clock, no page, no import; depcruise holds the imports
    // too, and this names the globals it cannot see.
    files: ['packages/report-export/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_AMBIENT_STATE.map((rule) => ({ ...rule, message: rule.message.replace('packages/core', 'report-export') })),
        ...NO_FLOAT_MONEY,
        ...NO_SILENT_FALLBACK,
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'Blob', 'URL', 'fetch', 'localStorage'].map((name) => ({
          name,
          message: 'report-export returns text; the app makes the file and the download.',
        })),
        ...ambientGlobals('report-export', ['window', 'document', 'navigator', 'Blob', 'URL', 'fetch', 'localStorage']),
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
        // CLAUDE.md's "never toFixed outside the one display helper" is not
        // the engine's rule alone (architecture-b-03).
        ...NO_FLOAT_MONEY,
      ],
    },
  },
  {
    // An Edge Function sees the image, the prompt and the reply, and CLAUDE.md
    // says none of them is ever logged. Each file has one log(code, counts)
    // helper whose types admit a code and numbers only; console anywhere else,
    // even just named, is an error, so a stray log line cannot carry content.
    files: ['supabase/functions/*/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='console']:not(FunctionDeclaration[id.name='log'] Identifier)",
          message: 'Log through this file\'s log(code, counts) helper only: codes and counts, never content.',
        },
        ...NO_FLOAT_MONEY,
      ],
    },
  },
  {
    // The AI apps server logs through src/log.ts alone, codes and counts
    // (PLAN §2.6), as the Edge Functions do; console elsewhere is an error.
    files: ['packages/ai-apps/src/**/*.ts'],
    ignores: ['packages/ai-apps/src/log.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "Identifier[name='console']", message: "Log through src/log.ts's log(code, counts) only: codes and counts, never content." },
        ...NO_FLOAT_MONEY,
      ],
    },
  },
  {
    files: [
      'packages/ai-apps/test/**/*.ts',
      'packages/core/test/**/*.ts',
      'packages/schema/test/**/*.ts',
      'packages/statement-parsers/test/**/*.ts',
      'packages/chart-specs/test/**/*.ts',
      'packages/savings-coach/test/**/*.ts',
      'packages/report-export/test/**/*.ts',
      'packages/money-primitives/test/**/*.ts',
      'packages/golden-verification/test/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...NO_WEAK_ASSERTIONS] },
  },
  {
    // The app's and the functions' tests may use vi.mock (two do, for the
    // browser's own APIs), but CLAUDE.md's "never toBeCloseTo or snapshots
    // on money or dates" binds them too (architecture-b-03).
    files: ['apps/web/test/**/*.{ts,tsx}', 'supabase/functions/test/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...NO_WEAK_ASSERTIONS.filter((rule) => !rule.selector.includes("'mock'"))] },
  },
)
