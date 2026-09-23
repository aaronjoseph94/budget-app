/**
 * Workbook's income chart (Jan chart12): Goal and Actual for each income row.
 *
 * chart12 stacks Actual on top of Goal in columns numbered 1 to 7. Here each
 * income row is a named horizontal bar, its Actual drawn over a track as long
 * as its Goal (D8), in chart12's own colours: #CCE2DF for the Goal, #9ABDB7
 * for the Actual. Every length is basis points of one scale that core chose
 * (`goalBars`, F17), so bars compare across rows as chart12's single axis
 * lets them. An Actual beyond its Goal runs past its track, and a notch in
 * the card's colour marks where the Goal ended.
 */
import { FONT, WIDTH, type ChartFrame, fit, frame, lengthOf, textUnits } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface IncomeBar {
  /** The income source's name, as typed. Escaped; never markup. */
  readonly label: string
  /** Its Actual and Goal as the page shows them, e.g. "$325.00 of $400.00". */
  readonly valueText: string
  /** From core (`goalBars`): the Goal's length, or null for no goal. */
  readonly goalBp: number | null
  /** From core (`goalBars`): the Actual's length, or null for no bar. */
  readonly actualBp: number | null
}

export interface IncomeBarsInput extends ChartFrame {
  readonly bars: readonly IncomeBar[]
}

const GOAL = { fill: '#CCE2DF', class: 'chart-income-goal' } as const
const ACTUAL = { fill: '#9ABDB7', class: 'chart-income-actual' } as const
/** Income's ink (§6.6), readable on the card. */
const INK = { fill: '#4F6E69', class: 'chart-income-ink' } as const
const KEY = 220
const ROW = 340
/** 10 px thick at the designed size, with 4 px rounded ends. */
const BAR = 100
const ROUND = 40

export function incomeBars(input: IncomeBarsInput): SvgMarkup {
  const rows = input.bars.map((b, i) => row(b, KEY + i * ROW))
  return frame(input, KEY + input.bars.length * ROW + 20, [key(), ...rows])
}

/** Two series, so a key names them: colour is never the only way to tell them apart. */
function key(): SvgNode {
  const second = 160 + textUnits('Goal') + 100
  return el('g', {}, [
    el('rect', { x: 0, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...GOAL }),
    el('text', { x: 160, y: FONT, ...INK }, ['Goal']),
    el('rect', { x: second, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...ACTUAL }),
    el('text', { x: second + 160, y: FONT, ...INK }, ['Actual']),
  ])
}

function row(bar: IncomeBar, top: number): SvgNode {
  const barTop = top + 170
  const goal = bar.goalBp === null ? 0 : lengthOf(bar.goalBp, WIDTH)
  const actual = bar.actualBp === null ? 0 : lengthOf(bar.actualBp, WIDTH)
  const marks: SvgNode[] = []
  if (goal > 0) marks.push(el('rect', { x: 0, y: barTop, width: goal, height: BAR, rx: ROUND, ...GOAL }))
  if (actual > 0) marks.push(el('rect', { x: 0, y: barTop, width: actual, height: BAR, rx: ROUND, ...ACTUAL }))
  if (goal > 0 && actual > goal) {
    const notch = { stroke: '#FFFEFA', 'stroke-width': 20, class: 'chart-surface-gap' }
    marks.push(el('line', { x1: goal, y1: barTop, x2: goal, y2: barTop + BAR, ...notch }))
  }
  const room = WIDTH - textUnits(bar.valueText) - 60
  return el('g', {}, [
    el('title', {}, [`${bar.label}: ${bar.valueText}`]),
    el('text', { x: 0, y: top + 120, ...INK }, [fit(bar.label, room)]),
    el('text', { x: WIDTH, y: top + 120, 'text-anchor': 'end', ...INK, style: 'font-variant-numeric:tabular-nums' }, [
      bar.valueText,
    ]),
    ...marks,
  ])
}
