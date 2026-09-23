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

interface Paint {
  readonly fill: string
  readonly class: string
}
interface Palette {
  readonly goal: Paint
  readonly actual: Paint
  /** For every word: the block's ink (§6.6), readable on the card. */
  readonly ink: Paint
  readonly keys: readonly [string, string]
}

const INCOME: Palette = {
  goal: { fill: '#CCE2DF', class: 'chart-income-goal' },
  actual: { fill: '#9ABDB7', class: 'chart-income-actual' },
  ink: { fill: '#4F6E69', class: 'chart-income-ink' },
  keys: ['Goal', 'Actual'],
}

/**
 * Home's savings-goals chart (chart5, D23): what each fund holds over a
 * track as long as its goal, in Home's #EBD15C over #FEEA8D, and the
 * savings ink for words, since #EBD15C, Home's label colour, reads at 1.5
 * to one on white.
 */
const SAVINGS: Palette = {
  goal: { fill: '#FEEA8D', class: 'chart-savings-goal' },
  actual: { fill: '#EBD15C', class: 'chart-savings-saved' },
  ink: { fill: '#7C5512', class: 'chart-savings-ink' },
  keys: ['Goal', 'Saved'],
}
/**
 * Home's debt chart (chart4, D25): what is left of each debt, #9171D7, over
 * a track as long as its starting balance, #C8B6EB, and a purple ink of the
 * chart's hue for words, since #9171D7 reads at 3.8 to one on white.
 */
const DEBTS: Palette = {
  goal: { fill: '#C8B6EB', class: 'chart-debt-paid' },
  actual: { fill: '#9171D7', class: 'chart-debt-left' },
  ink: { fill: '#5B3FA8', class: 'chart-debt-ink' },
  keys: ['Starting balance', 'Left to pay'],
}
const KEY = 220
const ROW = 340
/** 10 px thick at the designed size, with 4 px rounded ends. */
const BAR = 100
const ROUND = 40

export function incomeBars(input: IncomeBarsInput): SvgMarkup {
  return drawBars(input, INCOME)
}

/**
 * The Year's savings goals: each fund's balance over its goal, as Home's
 * chart5 is meant to show them (D23). Each fund is on its own scale, as
 * each of chart5's columns is, so core gives the goal 10,000 bp and the
 * balance its share of it (`fundProgress`).
 */
export function savingsGoalBars(input: IncomeBarsInput): SvgMarkup {
  return drawBars(input, SAVINGS)
}

/**
 * The Year's debts: each one's balance today over its starting balance
 * (D25), every debt on one scale, the largest starting balance, as chart4's
 * columns share one axis; core gives the lengths (`goalBars`).
 */
export function debtBars(input: IncomeBarsInput): SvgMarkup {
  return drawBars(input, DEBTS)
}

function drawBars(input: IncomeBarsInput, palette: Palette): SvgMarkup {
  const rows = input.bars.map((b, i) => row(b, KEY + i * ROW, palette))
  return frame(input, KEY + input.bars.length * ROW + 20, [key(palette), ...rows])
}

/** Two series, so a key names them: colour is never the only way to tell them apart. */
function key({ goal, actual, ink, keys }: Palette): SvgNode {
  const second = 160 + textUnits(keys[0]) + 100
  return el('g', {}, [
    el('rect', { x: 0, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...goal }),
    el('text', { x: 160, y: FONT, ...ink }, [keys[0]]),
    el('rect', { x: second, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...actual }),
    el('text', { x: second + 160, y: FONT, ...ink }, [keys[1]]),
  ])
}

function row(bar: IncomeBar, top: number, { goal: GOAL, actual: ACTUAL, ink: INK }: Palette): SvgNode {
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
