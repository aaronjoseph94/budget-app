import { describe, expect, it } from 'vitest'
import ts from 'typescript'

/**
 * The owner's brevity rule (PRD 03, 2026-10-08): one idea per sentence,
 * no sentence over 90 characters, a hint of at most 8 words. Read from
 * the source, so a long sentence is caught before a screen draws it.
 * Help's articles have their own test (help-articles.test.ts).
 */
const SOURCES: Record<string, string> = import.meta.glob(['../src/**/*.{ts,tsx}', '!../src/help/articles.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Files whose long strings are not prose: SVG paths, a data URI, a focus selector, a select's column list. */
const NOT_PROSE = new Set(['../src/components/ui/icons.tsx', '../src/components/ui/form.tsx', '../src/components/ui/sheet.tsx', '../src/ledger.ts'])

/** Files the cut has not reached yet (PRD 03); each slice removes its own, and the last empties it. */
const NOT_YET = new Set([
  '../src/ImportScreen.tsx',
  '../src/auth.tsx',
  '../src/format.ts',
  '../src/help/UpdatesPanel.tsx',
  '../src/help/updates.ts',
  '../src/pdf-import.ts',
  '../src/reports/Habits.tsx',
  '../src/reports/Trends.tsx',
  '../src/review/SuggestedChanges.tsx',
  '../src/screens/AddGoalSheet.tsx',
  '../src/screens/AddScreen.tsx',
  '../src/screens/CalendarScreen.tsx',
  '../src/screens/DebtEditor.tsx',
  '../src/screens/DebtStrategies.tsx',
  '../src/screens/DebtsScreen.tsx',
  '../src/screens/LearnedShops.tsx',
  '../src/screens/MonthForecastLine.tsx',
  '../src/screens/MonthScreen.tsx',
  '../src/screens/MoreScreen.tsx',
  '../src/screens/PaycheckPeriod.tsx',
  '../src/screens/PaycheckScreen.tsx',
  '../src/screens/ReviewScreen.tsx',
  '../src/screens/SavingsScreen.tsx',
  '../src/screens/SetupPlans.tsx',
  '../src/screens/WeekScreen.tsx',
  '../src/screens/YearScreen.tsx',
  '../src/settings/ListsTab.tsx',
])

const LIMIT = 90
const HINT_WORDS = 8

/** A class list, a path or an address, told from prose by its punctuation. */
function looksLikeCode(text: string): boolean {
  if (/^(https?:|data:|\/|#)/.test(text)) return true
  const tokens = text.split(' ')
  return tokens.filter((w) => /[-:[\]/{}]/.test(w) && !/[.,;]$/.test(w)).length > tokens.length / 3
}

const sentencesOf = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[^a-z])/)
    .map((s) => s.trim())
    .filter(Boolean)

interface Found {
  readonly file: string
  readonly line: number
  readonly text: string
}

function scan(file: string, source: string): { long: Found[]; hints: Found[] } {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, kind)
  const long: Found[] = []
  const hints: Found[] = []
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
  const textOf = (n: ts.Node): string | null => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
    if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => `…${s.literal.text}`).join('')
    if (ts.isJsxText(n)) return n.text
    return null
  }
  const visit = (n: ts.Node) => {
    const text = textOf(n)
    if (text !== null && !looksLikeCode(text.replace(/\s+/g, ' ').trim())) {
      for (const s of sentencesOf(text)) if (s.length > LIMIT) long.push({ file, line: at(n), text: s })
    }
    // `hint="…"`, `hint: '…'` and `noBudgetsHint="…"`: the small line under a control or a More row.
    const named = ts.isJsxAttribute(n) || ts.isPropertyAssignment(n) ? n : null
    if (named !== null && /hint$/i.test(named.name.getText()) && named.initializer !== undefined) {
      const value = ts.isJsxExpression(named.initializer) ? named.initializer.expression : named.initializer
      const hint = value === undefined ? null : textOf(value)
      if (hint !== null && hint.trim().split(/\s+/).length > HINT_WORDS) hints.push({ file, line: at(n), text: hint })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { long, hints }
}

const found = Object.entries(SOURCES)
  .filter(([file]) => !NOT_PROSE.has(file) && !NOT_YET.has(file))
  .map(([file, source]) => scan(file, source))
const say = (f: Found) => `${f.file}:${f.line} (${f.text.length}) ${f.text}`

describe('every sentence the web app draws', () => {
  it('is at most 90 characters', () => {
    expect(found.flatMap((f) => f.long).map(say)).toEqual([])
  })

  it('is a hint of at most 8 words where it is a hint', () => {
    expect(found.flatMap((f) => f.hints).map(say)).toEqual([])
  })

  it('reads prose and leaves code alone', () => {
    const { long, hints } = scan(
      'x.tsx',
      `const a = 'A sentence that goes on and on and on and on and on and on and on and on and on and on and on and on. Short.'
       const b = 'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft'
       const c = <p hint="one two three four five six seven eight nine">Short. Also short.</p>
       const d = { hint: 'one two three four five six seven eight' }`,
    )
    expect(long.map((f) => f.line)).toEqual([1])
    expect(hints.map((f) => f.line)).toEqual([3])
  })
})
