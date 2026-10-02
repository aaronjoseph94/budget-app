/**
 * The Year's column charts, from Annual Budget's chart row:
 *
 * - chart40, "Monthly Income vs Expenses": a column a month, income Actual
 *   in Income's green (#10B981) with expense Actual in the neutral grey
 *   (#9CA3AF) stacked on it, as the workbook stacks them (F19). Expenses are
 *   no one list, so never Debts' rose (ADR 0010).
 * - chart42, "Annual Totals": Goal in the grey beside Actual in Mockup A's
 *   accent (#4F46E5) for Income, Savings and the four spending lists.
 *
 * Colours are Mockup A's since step 5, written into the file (N124).
 *
 * Every length is basis points of one scale that core chose (`stackedColumns`,
 * `goalBars`, F19); this file only turns them into rectangles. The workbook's value
 * axis ("$"#,##0) is not drawn: every amount is in the chart's description,
 * each column's own title, and the tables beside it.
 */
import { FONT, type ChartFrame, fit, frame, lengthOf, seriesKey, textUnits, widthOf } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

/** Where a stacked part starts and ends, from core (`stackedColumns`). */
export interface ColumnPart {
  readonly fromBp: number
  readonly toBp: number
}

export interface MonthColumn {
  /** The month, e.g. "Jan". Escaped; never markup. */
  readonly label: string
  /** Its amounts as the page shows them, for the column's title. */
  readonly valueText: string
  /** Income then expenses; null for a part not drawn. */
  readonly parts: readonly [ColumnPart | null, ColumnPart | null]
}

export interface IncomeExpenseInput extends ChartFrame {
  readonly columns: readonly MonthColumn[]
}

export interface GoalActualGroup {
  /** A short name, e.g. "Bills". Escaped; never markup. */
  readonly label: string
  readonly valueText: string
  /** From core (`goalBars`): lengths of one scale, or null for no bar. */
  readonly goalBp: number | null
  readonly actualBp: number | null
}

export interface GoalActualInput extends ChartFrame {
  readonly groups: readonly GoalActualGroup[]
}

const KEY = 220
const TOP = KEY + 40
const PLOT = 1400
const BASE = TOP + PLOT
/** Mockup A's muted words, #6B7280, 4.83 to one on the card. */
const INK = { fill: '#6B7280', class: 'chart-year-ink' } as const

const INCOME = { fill: '#10B981', class: 'chart-year-income' } as const
const EXPENSES = { fill: '#9CA3AF', class: 'chart-year-expenses' } as const
const GOAL = { fill: '#9CA3AF', class: 'chart-year-goal' } as const
const ACTUAL = { fill: '#4F46E5', class: 'chart-year-actual' } as const

export function incomeExpenseColumns(input: IncomeExpenseInput): SvgMarkup {
  const width = widthOf(input)
  const step = Math.floor(width / Math.max(input.columns.length, 1))
  const bar = Math.floor((step * 3) / 5)
  const look = monthLabels(input.columns.map((c) => c.label), step)
  const columns = input.columns.map((c, i) => {
    const x = i * step + Math.floor((step - bar) / 2)
    const marks = c.parts.flatMap((p, s): SvgNode[] => {
      if (p === null) return []
      const top = lengthOf(p.toBp, PLOT)
      const height = top - lengthOf(p.fromBp, PLOT)
      return height > 0 ? [el('rect', { x, y: BASE - top, width: bar, height, ...(s === 0 ? INCOME : EXPENSES) })] : []
    })
    const label = el('text', { x: i * step + Math.floor(step / 2), y: BASE + 160, 'text-anchor': 'middle', ...look.size, ...INK }, [
      look.text(c.label),
    ])
    return el('g', {}, [el('title', {}, [`${c.label}: ${c.valueText}`]), ...marks, label])
  })
  return frame(input, BASE + 220, [
    seriesKey(
      [
        ['Income', INCOME],
        ['Expenses', EXPENSES],
      ],
      INK,
    ),
    baseline(width),
    ...columns,
  ])
}

export function goalActualColumns(input: GoalActualInput): SvgMarkup {
  const width = widthOf(input)
  const step = Math.floor(width / Math.max(input.groups.length, 1))
  const bar = Math.floor((step * 7) / 20)
  // Labels a little smaller than the chart's text, so a list's name fits
  // under its pair of columns; `fit` counts characters at FONT.
  const size = Math.floor((FONT * 4) / 5)
  const groups = input.groups.map((g, i) => {
    const left = i * step + Math.floor(step / 2) - bar - 10
    const column = (bp: number | null, x: number, colours: typeof GOAL | typeof ACTUAL): SvgNode[] => {
      const height = bp === null ? 0 : lengthOf(bp, PLOT)
      return height > 0 ? [el('rect', { x, y: BASE - height, width: bar, height, ...colours })] : []
    }
    const label = el(
      'text',
      { x: i * step + Math.floor(step / 2), y: BASE + 150, 'text-anchor': 'middle', 'font-size': size, ...INK },
      [fit(g.label, Math.floor(((step - 20) * FONT) / size))],
    )
    return el('g', {}, [
      el('title', {}, [`${g.label}: ${g.valueText}`]),
      ...column(g.goalBp, left, GOAL),
      ...column(g.actualBp, left + bar + 20, ACTUAL),
      label,
    ])
  })
  return frame(input, BASE + 220, [
    seriesKey(
      [
        ['Goal', GOAL],
        ['Actual', ACTUAL],
      ],
      INK,
    ),
    baseline(width),
    ...groups,
  ])
}

/** The narrowest gap between two months' names, 6 px at the designed size. */
const GAP = 60

/**
 * How the months under the columns are written so that no two touch (V6):
 * whole at the chart's size where they fit with a gap, a little smaller
 * where that is enough (no smaller than four fifths), and otherwise by
 * their first letter, "J F M". The whole name stays in each column's title.
 */
function monthLabels(labels: readonly string[], step: number): { size: Readonly<Record<string, number>>; text: (label: string) => string } {
  const widest = Math.max(0, ...labels.map((l) => textUnits(l)))
  if (widest + GAP <= step) return { size: {}, text: (l) => fit(l, step) }
  const size = Math.floor((FONT * (step - GAP)) / widest)
  if (size >= Math.ceil((FONT * 4) / 5)) return { size: { 'font-size': size }, text: (l) => l }
  return { size: {}, text: (l) => Array.from(l)[0] ?? '' }
}


function baseline(width: number): SvgNode {
  return el('line', {
    x1: 0,
    y1: BASE,
    x2: width,
    y2: BASE,
    stroke: '#E5E7EB',
    'stroke-width': 10,
    class: 'chart-year-rule',
  })
}
