import { describe, expect, it } from 'vitest'
import {
  debtBars,
  goalActualColumns,
  incomeExpenseColumns,
  savingsGoalBars,
  shareRing,
  spendingDoughnut,
  yearPie,
} from '@budget/chart-specs'
// Whole, as written: vitest.config.ts lets this one stylesheet through.
import css from '../src/index.css?raw'

/**
 * index.css repaints a chart's marks for dark mode with rules scoped to the
 * class chart-specs puts on every chart. Renaming one and not the other
 * leaves each chart in its light colours on a dark card, and nothing else
 * would notice: the marks still draw, from their own attributes.
 */
describe('the chart stylesheet', () => {
  const svg = String(spendingDoughnut({ id: 'c1', title: 'Spending', description: 'Nothing yet.', slices: [] }))
  const scope = /^<svg[^>]* class="([^"]+)"/.exec(svg)?.[1]

  it('scopes every chart rule to the class a chart is drawn with', () => {
    const rules = [...css.matchAll(/^([^\s{][^{\n]*\.chart-[\w-]+)\s*\{/gm)].map((m) => m[1])
    expect(scope).toBeTruthy()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.filter((rule) => !rule?.startsWith(`.${scope} .chart-`))).toEqual([])
  })
})

/**
 * The Year's charts carry Mockup A's colours twice (step 5): in each mark's
 * attributes, which an exported file keeps, and in the rule here that
 * paints its class on the page, which is what the owner sees. So each
 * rule's light colour is the attribute's, and a rule cannot turn Expenses
 * to Debts' rose, or Debts back to the workbook's violet, unseen.
 */
describe("the Year's charts on the page", () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const light = new Map(
    [...css.slice(css.indexOf(':root'), css.indexOf('@media (prefers-color-scheme: dark)')).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(
      (m) => [m[1] ?? '', (m[2] ?? '').toLowerCase()],
    ),
  )
  /** The light colour the rule for `.spec-chart .cls` paints `property` with, if one does. */
  const painted = (cls: string, property: string) => {
    for (const [, selectors = '', body = ''] of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors.split(',').some((s) => s.trim() === `.spec-chart .${cls}`)) continue
      const token = new RegExp(`(?:^|[;\\s])${property}:\\s*var\\(--([\\w-]+)\\)`).exec(body)?.[1]
      if (token !== undefined) return light.get(token) ?? `--${token} has no light colour`
    }
    return undefined
  }
  const frame = { id: 'y', title: 'Year', description: 'd' }
  const bars = [{ label: 'A', valueText: 'a', goalBp: 10_000, actualBp: 5_000 }]
  const svg = [
    yearPie({ ...frame, slices: ['Income', 'Expenses', 'Savings'].map((label) => ({ label, shareBp: 3_000, valueText: 'v' })) }),
    shareRing({ ...frame, shareBp: 2_500, rank: 0, centreText: '25%' }),
    incomeExpenseColumns({ ...frame, columns: [{ label: 'Jan', valueText: 'v', parts: [{ fromBp: 0, toBp: 5_000 }, { fromBp: 5_000, toBp: 9_000 }] }] }),
    goalActualColumns({ ...frame, groups: [{ label: 'Income', valueText: 'v', goalBp: 10_000, actualBp: 8_000 }] }),
    savingsGoalBars({ ...frame, bars }),
    debtBars({ ...frame, bars }),
  ].join('')

  it('paints every classed mark in the light colour its own attribute carries', () => {
    const checked: string[] = []
    const wrong: string[] = []
    for (const [, attributes = ''] of svg.matchAll(/<(?:path|rect|text|line)\b([^>]*)>/g)) {
      const classes = /\bclass="([^"]+)"/.exec(attributes)?.[1]?.split(' ') ?? []
      for (const property of ['fill', 'stroke']) {
        const own = new RegExp(`\\b${property}="(#[0-9A-Fa-f]{6})"`).exec(attributes)?.[1]?.toLowerCase()
        if (own === undefined || classes.length === 0) continue
        const cls = classes.find((c) => painted(c, property) !== undefined)
        if (cls === undefined) wrong.push(`${classes.join(' ')} has no ${property} rule`)
        else if (painted(cls, property) !== own) wrong.push(`${cls} ${property}: ${own} in the file, ${painted(cls, property)} on the page`)
        else checked.push(`${cls} ${property}`)
      }
    }
    expect(wrong).toEqual([])
    // The step's decisions among them: Expenses and Goal grey, Actual the accent, Debts rose.
    expect(checked).toEqual(
      expect.arrayContaining(['chart-pie-1 fill', 'chart-year-expenses fill', 'chart-year-goal fill', 'chart-year-actual fill', 'chart-debts-left fill']),
    )
  })
})
