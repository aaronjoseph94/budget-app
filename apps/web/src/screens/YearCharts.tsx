import { useId, useMemo } from 'react'
import { partShares, type TopExpense, type YearSheet } from '@budget/core'
import { shareRing, yearPie, type SvgMarkup } from '@budget/chart-specs'
import { formatCents, formatShare } from '../format.js'
import { SvgChart } from '../components/ui/chart.js'

/**
 * The Year's charts (plan §6.4, S14b), drawn by chart-specs from what core
 * computed: every slice, ring and column length is basis points from
 * `partShares`, `stackedColumns`, `goalBars` or F18's `shareBp` (F19). This
 * file only formats the amounts written beside them.
 */

/** Names a chart's title and description; useId's punctuation is not allowed in a chart id. */
function useChartId(): string {
  return `chart${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
}

const said = (parts: readonly string[]) => parts.join('. ') + '.'

/**
 * The Year's income, expenses and savings as a pie: Home's chart3 in Home's
 * colours at the top, Annual's chart41 in Annual's on a desktop.
 */
export function YearPie({ sheet, palette }: { sheet: YearSheet; palette: 'home' | 'annual' }) {
  const id = useChartId()
  const svg = useMemo((): SvgMarkup => {
    const named: readonly [string, number][] = [
      ['Income', sheet.totals.income.actualCents],
      ['Expenses', sheet.totals.expenses.actualCents],
      ['Savings', sheet.totals.savings.actualCents],
    ]
    const shares = partShares({ parts: named.map(([key, cents]) => ({ key, cents })) }).parts
    const slices = named.map(([label, cents], i) => {
      const shareBp = shares[i]!.shareBp
      return {
        label,
        shareBp,
        valueText: shareBp === null ? formatCents(cents) : `${formatCents(cents)} · ${formatShare(shareBp)}`,
      }
    })
    return yearPie({
      id,
      title: 'Income, expenses and savings',
      description: said(slices.map((s) => `${s.label}: ${s.valueText}`)),
      palette,
      slices,
    })
  }, [id, sheet, palette])
  return <SvgChart svg={svg} className="mx-auto max-w-xs" />
}

/** Home's chart9–11: one of the top 3 as its share of a ring. */
export function TopRing({ top, rank }: { top: TopExpense; rank: number }) {
  const id = useChartId()
  const svg = useMemo(
    () =>
      shareRing({
        id,
        title: top.name,
        description: `${top.name}: ${formatShare(top.shareBp)} of the year's spending.`,
        shareBp: top.shareBp,
        rank,
        centreText: formatShare(top.shareBp),
      }),
    [id, top, rank],
  )
  // Sized by a box of its own: SvgChart is always full width, and a second
  // width class beside its own would lose or win by stylesheet order (cn).
  return (
    <div className="w-14 shrink-0">
      <SvgChart svg={svg} />
    </div>
  )
}
