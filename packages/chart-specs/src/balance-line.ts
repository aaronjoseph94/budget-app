/**
 * The Forecast's next 30 days (plan §2.5, §7; F32): the bank balance day by
 * day as a line, today first, with the tightest day marked and named, and
 * $0 as a dashed rule when the line reaches it. Heights arrive from core
 * in basis points (scaleSeries), and days are spread evenly across; nothing
 * here divides money. The page lists the same figures beside it.
 */
import { FONT, WIDTH, type ChartFrame, frame, lengthOf } from './frame.js'
import { label } from './range-bar.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface BalanceLineInput extends ChartFrame {
  /** Each day's balance, placed by core (scaleSeries), today first. */
  readonly pointsBp: readonly number[]
  /** Where $0 sits, when the line reaches it. */
  readonly zeroBp: number | null
  /** Which point is the tightest day, or null to mark none. */
  readonly lowestIndex: number | null
  /** The tightest day as the page shows it, e.g. "8 Oct: $2,032.52". */
  readonly lowestText: string | null
  /** Under the first and the last day, e.g. "Today" and "24 Oct". */
  readonly startText: string
  readonly endText: string
}

const EDGE = 80
const SPAN = WIDTH - 2 * EDGE
const TOP = FONT + 160
const PLOT = 1_200

const INK = { fill: '#6B7280', class: 'chart-forecast-ink' }

export function balanceLine(input: BalanceLineInput): SvgMarkup {
  const n = input.pointsBp.length
  const x = (i: number) => (n < 2 ? EDGE : EDGE + Math.floor((2 * i * SPAN + (n - 1)) / (2 * (n - 1))))
  const y = (bp: number) => TOP + PLOT - lengthOf(bp, PLOT)
  const marks: SvgNode[] = []
  if (input.zeroBp !== null) {
    const zero = y(input.zeroBp)
    marks.push(el('line', { x1: EDGE, y1: zero, x2: WIDTH - EDGE, y2: zero, stroke: '#6B7280', 'stroke-width': 10, 'stroke-dasharray': '30 20', class: 'chart-forecast-rule' }))
  }
  const points = input.pointsBp.map((bp, i) => `${x(i)},${y(bp)}`).join(' ')
  if (n > 0) {
    marks.push(el('polyline', { points, fill: 'none', stroke: '#4F46E5', 'stroke-width': 30, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'chart-forecast-line' }))
  }
  const low = input.lowestIndex
  let named = false
  if (low !== null && low >= 0 && low < n) {
    const [cx, cy] = [x(low), y(input.pointsBp[low]!)]
    marks.push(el('circle', { cx, cy, r: 50, fill: '#BE123C', class: 'chart-forecast-low' }))
    // Under the point, where the line never goes, since it is the lowest:
    // over it, the name crossed the line where it rose steeply the next day
    // (N86). The first and last days' names then take the row below it.
    if (input.lowestText !== null) {
      marks.push(label(input.lowestText, cx, cy + 100 + FONT))
      named = true
    }
  }
  const base = TOP + PLOT + FONT + 100 + (named ? FONT + 60 : 0)
  marks.push(el('text', { x: EDGE, y: base, ...INK }, [input.startText]))
  marks.push(el('text', { x: WIDTH - EDGE, y: base, 'text-anchor': 'end', ...INK }, [input.endText]))
  return frame(input, base + 60, marks)
}
