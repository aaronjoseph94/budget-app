import { describe, expect, it } from 'vitest'
import { spendingDoughnut } from '@budget/chart-specs'
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
