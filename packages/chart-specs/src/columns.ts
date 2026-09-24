/**
 * The Year's column charts, from Annual Budget's chart row:
 *
 * - chart40, "Monthly Income vs Expenses": a column a month, income Actual
 *   (#D7EEEB) with expense Actual (#F9D7D2) stacked on it, as the workbook stacks
 *   them (F19).
 * - chart42, "Annual Totals": Goal (#517070) beside Actual (#E6E1CE) for
 *   Income, Savings and the four spending lists.
 *
 * Every length is basis points of one scale that core chose (`stackedColumns`,
 * `goalBars`, F19); this file only turns them into rectangles. The workbook's value
 * axis ("$"#,##0) is not drawn: every amount is in the chart's description,
 * each column's own title, and the tables beside it.
 */
import { FONT, WIDTH, type ChartFrame, fit, frame, lengthOf, textUnits } from './frame.js'
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
const SWATCH = 100
/** Annual's axis text #616F7C, darkened to #5B6773 to read on the card. */
const INK = { fill: '#5B6773', class: 'chart-year-ink' } as const

const INCOME = { fill: '#D7EEEB', class: 'chart-year-income' } as const
const EXPENSES = { fill: '#F9D7D2', class: 'chart-year-expenses' } as const
const GOAL = { fill: '#517070', class: 'chart-year-goal' } as const
const ACTUAL = { fill: '#E6E1CE', class: 'chart-year-actual' } as const

export function incomeExpenseColumns(input: IncomeExpenseInput): SvgMarkup {
  const step = Math.floor(WIDTH / Math.max(input.columns.length, 1))
  const bar = Math.floor((step * 3) / 5)
  const columns = input.columns.map((c, i) => {
    const x = i * step + Math.floor((step - bar) / 2)
    const marks = c.parts.flatMap((p, s): SvgNode[] => {
      if (p === null) return []
      const top = lengthOf(p.toBp, PLOT)
      const height = top - lengthOf(p.fromBp, PLOT)
      return height > 0 ? [el('rect', { x, y: BASE - top, width: bar, height, ...(s === 0 ? INCOME : EXPENSES) })] : []
    })
    const label = el('text', { x: i * step + Math.floor(step / 2), y: BASE + 160, 'text-anchor': 'middle', ...INK }, [
      fit(c.label, step),
    ])
    return el('g', {}, [el('title', {}, [`${c.label}: ${c.valueText}`]), ...marks, label])
  })
  return frame(input, BASE + 220, [
    key([
      ['Income', INCOME],
      ['Expenses', EXPENSES],
    ]),
    baseline(),
    ...columns,
  ])
}

export function goalActualColumns(input: GoalActualInput): SvgMarkup {
  const step = Math.floor(WIDTH / Math.max(input.groups.length, 1))
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
    key([
      ['Goal', GOAL],
      ['Actual', ACTUAL],
    ]),
    baseline(),
    ...groups,
  ])
}

/** Two series, so a key names them: colour is never the only way to tell them apart. */
function key(series: readonly [string, { readonly fill: string; readonly class: string }][]): SvgNode {
  let x = 0
  const marks = series.flatMap(([name, colours]) => {
    const at = x
    x += SWATCH + 60 + textUnits(name) + 100
    return [
      el('rect', { x: at, y: 30, width: SWATCH, height: SWATCH, rx: 20, ...colours }),
      el('text', { x: at + SWATCH + 60, y: FONT, ...INK }, [name]),
    ]
  })
  return el('g', {}, marks)
}

function baseline(): SvgNode {
  return el('line', {
    x1: 0,
    y1: BASE,
    x2: WIDTH,
    y2: BASE,
    stroke: '#CCCCCC',
    'stroke-width': 10,
    class: 'chart-year-rule',
  })
}
