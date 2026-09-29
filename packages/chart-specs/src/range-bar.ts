/**
 * The Forecast's month-end range against today (plan §2.5, §7; F30).
 *
 * One scale, from core's scaleSeries over today's balance and the month's
 * end: the range as a bar, its most likely end as a notch in it, and
 * today's balance as a dot, so "from here to there" reads at a glance. A
 * rough forecast is one figure, drawn as a short bar with no notch. Every
 * place arrives in basis points; nothing here divides money. The figures
 * are also the page's text beside it, and the chart's description.
 */
import { FONT, WIDTH, type ChartFrame, frame, lengthOf } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface RangeBarInput extends ChartFrame {
  /** The month's end, lowest, most likely and highest, each placed by core (scaleSeries). */
  readonly lowBp: number
  readonly midBp: number
  readonly highBp: number
  /** Today's balance, placed on the same scale; null when it is not drawn. */
  readonly todayBp: number | null
  /** Where $0 sits on the scale, when it is on it. */
  readonly zeroBp: number | null
  /** The most likely end as the page shows it, e.g. "About $3,310". */
  readonly midText: string
  /** Today's balance as the page shows it, e.g. "Today $1,760.00". */
  readonly todayText: string | null
}

/** Room at each end, so a round end or a dot at 0 or 10,000 bp is not cut off. */
const EDGE = 80
const SPAN = WIDTH - 2 * EDGE
const BAR_TOP = 260
const BAR = 120
/** The narrowest a range is drawn, so a rough forecast's one figure still shows. */
const LEAST = 120

/**
 * The Forecast's and Reports' charts carry Mockup A's light tokens in their
 * attributes, as the page paints them (N124): muted ink #6B7280, the accent
 * #4F46E5 and its fades, the card #FFFFFF, the ink #111827 for today's ring.
 */
const INK = { fill: '#6B7280', class: 'chart-forecast-ink' }

export function rangeBar(input: RangeBarInput): SvgMarkup {
  const at = (bp: number) => EDGE + lengthOf(bp, SPAN)
  const [low, mid, high] = [at(input.lowBp), at(input.midBp), at(input.highBp)]
  const width = Math.max(LEAST, high - low)
  const left = high - low >= LEAST ? low : Math.max(0, mid - LEAST / 2)
  const marks: SvgNode[] = [
    el('rect', { x: EDGE, y: BAR_TOP + 40, width: SPAN, height: 40, rx: 20, fill: '#F3F4F6', class: 'chart-forecast-track' }),
  ]
  if (input.zeroBp !== null) {
    const zero = at(input.zeroBp)
    marks.push(el('line', { x1: zero, y1: BAR_TOP - 40, x2: zero, y2: BAR_TOP + BAR + 40, stroke: '#6B7280', 'stroke-width': 10, 'stroke-dasharray': '30 20', class: 'chart-forecast-rule' }))
  }
  marks.push(el('rect', { x: left, y: BAR_TOP, width, height: BAR, rx: BAR / 2, fill: '#4F46E5', class: 'chart-forecast-range' }))
  // The most likely end, as a notch in the card's colour; none on one rough figure.
  if (high - low >= LEAST) {
    marks.push(el('line', { x1: mid, y1: BAR_TOP, x2: mid, y2: BAR_TOP + BAR, stroke: '#FFFFFF', 'stroke-width': 20, class: 'chart-surface-gap' }))
  }
  marks.push(label(input.midText, mid, BAR_TOP + BAR + FONT + 100))
  if (input.todayBp !== null && input.todayText !== null) {
    const today = at(input.todayBp)
    marks.push(el('circle', { cx: today, cy: BAR_TOP + BAR / 2, r: 50, fill: '#FFFFFF', stroke: '#111827', 'stroke-width': 30, class: 'chart-forecast-today' }))
    marks.push(label(input.todayText, today, FONT + 40))
  }
  return frame(input, BAR_TOP + BAR + FONT + 140, marks)
}

/** A label over or under a place, kept inside the chart: from its left near the left edge, to its right near the right. */
export function label(text: string, x: number, y: number): SvgNode {
  const anchor = x < WIDTH / 3 ? 'start' : x > (2 * WIDTH) / 3 ? 'end' : 'middle'
  const edge = anchor === 'start' ? Math.max(0, x - EDGE) : anchor === 'end' ? Math.min(WIDTH, x + EDGE) : x
  return el('text', { x: edge, y, 'text-anchor': anchor, ...INK, style: 'font-variant-numeric:tabular-nums' }, [text])
}
