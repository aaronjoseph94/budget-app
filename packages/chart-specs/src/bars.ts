/**
 * The workbook's income chart (Jan chart12): Goal and Actual for each income row.
 *
 * chart12 stacks Actual on top of Goal in columns numbered 1 to 7. Here each
 * income row is a named horizontal bar, its Actual drawn over a track as long
 * as its Goal (D8), in Income's green (ADR 0010, N124): #D1FAE5 for the Goal,
 * #10B981 for the Actual, and #047857 for words. Every length is basis points of one scale that core chose
 * (`goalBars`, F17), so bars compare across rows as chart12's single axis
 * lets them. An Actual beyond its Goal runs past its track, and a notch in
 * the card's colour marks where the Goal ended.
 */
import { FONT, type ChartFrame, fit, frame, lengthOf, textUnits, widthOf } from './frame.js'
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
  /** The class that edges the Goal's key swatch in the Actual's colour. */
  readonly edge: string
}

const INCOME: Palette = {
  goal: { fill: '#D1FAE5', class: 'chart-income-goal' },
  actual: { fill: '#10B981', class: 'chart-income-actual' },
  ink: { fill: '#047857', class: 'chart-income-ink' },
  keys: ['Goal', 'Actual'],
  edge: 'chart-income-edge',
}

/**
 * Home's savings-goals chart (chart5, D23): what each fund holds over a
 * track as long as its goal, in Savings' amber #F59E0B over its tile
 * #FEF3C7, and the savings ink #B45309 for words, since the amber reads at
 * 2.1 to one on white (ADR 0010, N124).
 */
const SAVINGS: Palette = {
  goal: { fill: '#FEF3C7', class: 'chart-savings-goal' },
  actual: { fill: '#F59E0B', class: 'chart-savings-saved' },
  ink: { fill: '#B45309', class: 'chart-savings-ink' },
  keys: ['Goal', 'Saved'],
  edge: 'chart-savings-edge',
}
/**
 * Home's debt chart (chart4, D25): what is left of each debt in Debts'
 * rose #E11D48, over a track as long as its starting balance in its tile
 * #FFE4E6, and the debts ink #BE123C for words (ADR 0010, N124). Its
 * classes (chart-debts-*) are its own, apart from the Debts screen's
 * ring's (chart-debt-*).
 */
const DEBTS: Palette = {
  goal: { fill: '#FFE4E6', class: 'chart-debts-track' },
  actual: { fill: '#E11D48', class: 'chart-debts-left' },
  ink: { fill: '#BE123C', class: 'chart-debts-ink' },
  keys: ['Starting balance', 'Left to pay'],
  edge: 'chart-debts-edge',
}
/**
 * The Habits tab's weekdays (F40): each weekday's average everyday
 * spending over a track as long as the daily allowance, in the spending
 * grid's hue, so the two charts read as one. With no weekly budget there
 * is no allowance to draw, so no track and no key.
 */
const WEEKDAYS: Palette = {
  goal: { fill: '#FFEDD5', class: 'chart-variable-track' },
  actual: { fill: '#A42F1A', class: 'chart-heat-3' },
  ink: { fill: '#6B7280', class: 'chart-forecast-ink' },
  keys: ['Daily allowance', 'Average'],
  edge: 'chart-heat-edge',
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

/** Each weekday's average over the daily allowance, on one scale (core's `weekdayPattern`). */
export function weekdayBars(input: IncomeBarsInput): SvgMarkup {
  return drawBars(input, WEEKDAYS, input.bars.some((b) => b.goalBp !== null))
}

function drawBars(input: IncomeBarsInput, palette: Palette, keyed = true): SvgMarkup {
  const top = keyed ? KEY : 0
  const width = widthOf(input)
  const rows = input.bars.map((b, i) => row(b, top + i * ROW, palette, width))
  return frame(input, top + input.bars.length * ROW + 20, keyed ? [key(palette), ...rows] : rows)
}

/**
 * Two series, so a key names them: colour is never the only way to tell them
 * apart. The Goal's tile is pale on the card (#FEF3C7 is 1.1 to one), so its
 * swatch is edged in the Actual's colour, a 1 px line (V4); the bars are not.
 */
function key({ goal, actual, ink, keys, edge }: Palette): SvgNode {
  const second = 160 + textUnits(keys[0]) + 100
  return el('g', {}, [
    el('rect', { x: 0, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...goal, class: `${goal.class} ${edge}`, stroke: actual.fill, 'stroke-width': 10 }),
    el('text', { x: 160, y: FONT, ...ink }, [keys[0]]),
    el('rect', { x: second, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...actual }),
    el('text', { x: second + 160, y: FONT, ...ink }, [keys[1]]),
  ])
}

function row(bar: IncomeBar, top: number, { goal: GOAL, actual: ACTUAL, ink: INK }: Palette, width: number): SvgNode {
  const barTop = top + 170
  const goal = bar.goalBp === null ? 0 : lengthOf(bar.goalBp, width)
  const actual = bar.actualBp === null ? 0 : lengthOf(bar.actualBp, width)
  const marks: SvgNode[] = []
  if (goal > 0) marks.push(el('rect', { x: 0, y: barTop, width: goal, height: BAR, rx: ROUND, ...GOAL }))
  if (actual > 0) marks.push(el('rect', { x: 0, y: barTop, width: actual, height: BAR, rx: ROUND, ...ACTUAL }))
  if (goal > 0 && actual > goal) {
    const notch = { stroke: '#FFFFFF', 'stroke-width': 20, class: 'chart-surface-gap' }
    marks.push(el('line', { x1: goal, y1: barTop, x2: goal, y2: barTop + BAR, ...notch }))
  }
  const room = width - textUnits(bar.valueText) - 60
  return el('g', {}, [
    el('title', {}, [`${bar.label}: ${bar.valueText}`]),
    el('text', { x: 0, y: top + 120, ...INK }, [fit(bar.label, room)]),
    el('text', { x: width, y: top + 120, 'text-anchor': 'end', ...INK, style: 'font-variant-numeric:tabular-nums' }, [
      bar.valueText,
    ]),
    ...marks,
  ])
}
