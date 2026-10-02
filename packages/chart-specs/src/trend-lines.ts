/**
 * Trends (plan §2.6, §7; F37): Income, Spent and Saved month by month as
 * three lines on one scale, and a category's months as a sparkline against
 * its usual level. Heights arrive from core in basis points (scaleSeries),
 * months are spread evenly across, and a month with no records is a gap:
 * the line stops and starts again rather than dropping to $0. Nothing here
 * divides money. The page lists the same figures beside each chart.
 */
import { FONT, WIDTH, type ChartFrame, across, fit, frame, lengthOf, widthOf } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface TrendSeries {
  /** What the line is, e.g. "Spent". Escaped; never markup. */
  readonly name: string
  /** Each month's place, oldest first; null is a month with no records. */
  readonly pointsBp: readonly (number | null)[]
  readonly tone: 'income' | 'spent' | 'saved'
}

export interface TrendLinesInput extends ChartFrame {
  readonly series: readonly TrendSeries[]
  /** Where $0 sits on the lines' one scale. */
  readonly zeroBp: number
  /** Under the first and the last month, e.g. "Mar" and "Aug". */
  readonly startText: string
  readonly endText: string
}

const EDGE = 80
const KEY = 260
const PLOT = 1_200

const INK = { fill: '#6B7280', class: 'chart-forecast-ink' } as const
const RULE = { stroke: '#6B7280', 'stroke-width': 10, 'stroke-dasharray': '30 20', class: 'chart-forecast-rule' } as const
/** Each line has its own colour and dash, so colour is never the only way to tell them apart. */
const TONE = {
  income: { stroke: '#047857', 'stroke-dasharray': '90 40', class: 'chart-trend-income' },
  spent: { stroke: '#BE123C', 'stroke-dasharray': 'none', class: 'chart-trend-spent' },
  saved: { stroke: '#B45309', 'stroke-dasharray': '20 40', class: 'chart-trend-saved' },
} as const

/**
 * A line broken at every gap: a polyline for each run of months, a dot for
 * a month on its own. The dot's class is the line's with `-dot`, since a
 * rule filling the line's class would fill the polyline too.
 */
function runs(
  points: readonly (number | null)[],
  at: (i: number, bp: number) => readonly [number, number],
  paint: { readonly stroke: string; readonly class: string } & Readonly<Record<string, string | number>>,
  dot: number,
): SvgNode[] {
  const marks: SvgNode[] = []
  let run: (readonly [number, number])[] = []
  const close = () => {
    if (run.length === 1) {
      const [cx, cy] = run[0]!
      marks.push(el('circle', { cx, cy, r: dot, fill: paint.stroke, class: `${paint.class}-dot` }))
    } else if (run.length > 1) {
      marks.push(el('polyline', { points: run.map(([px, py]) => `${px},${py}`).join(' '), fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...paint }))
    }
    run = []
  }
  points.forEach((bp, i) => {
    if (bp === null) close()
    else run.push(at(i, bp))
  })
  close()
  return marks
}

export function trendLines(input: TrendLinesInput): SvgMarkup {
  const y = (bp: number) => KEY + PLOT - lengthOf(bp, PLOT)
  const width = widthOf(input)
  const span = width - 2 * EDGE
  const marks: SvgNode[] = [key(input.series, width)]
  const zero = y(input.zeroBp)
  marks.push(el('line', { x1: EDGE, y1: zero, x2: width - EDGE, y2: zero, ...RULE }))
  for (const s of input.series) {
    const n = s.pointsBp.length
    marks.push(...runs(s.pointsBp, (i, bp) => [across(i, n, EDGE, span), y(bp)], { 'stroke-width': 30, ...TONE[s.tone] }, 40))
  }
  const base = KEY + PLOT + FONT + 100
  marks.push(el('text', { x: EDGE, y: base, ...INK }, [input.startText]))
  marks.push(el('text', { x: width - EDGE, y: base, 'text-anchor': 'end', ...INK }, [input.endText]))
  return frame(input, base + 60, marks)
}

/** A short sample of each line and its name, side by side. */
function key(series: readonly TrendSeries[], width: number): SvgNode {
  const each = series.length === 0 ? width : Math.floor(width / series.length)
  return el(
    'g',
    {},
    series.map((s, i) =>
      el('g', {}, [
        el('line', { x1: i * each, y1: 80, x2: i * each + 200, y2: 80, 'stroke-width': 30, ...TONE[s.tone] }),
        el('text', { x: i * each + 260, y: FONT, ...INK }, [fit(s.name, each - 300)]),
      ]),
    ),
  )
}

export interface SparklineInput extends ChartFrame {
  /** Each month's place on the row's own scale, oldest first; null is a month with no records. */
  readonly pointsBp: readonly (number | null)[]
  /** The usual level's place, drawn as a dashed rule; null with none. */
  readonly usualBp: number | null
}

const SPARK = 600
const SPARK_EDGE = 60

/** A category's months as one small line, its latest month dotted, and its usual level dashed across. */
export function sparkline(input: SparklineInput): SvgMarkup {
  const n = input.pointsBp.length
  const span = WIDTH - 2 * SPARK_EDGE
  const x = (i: number) => across(i, n, SPARK_EDGE, span)
  const y = (bp: number) => SPARK_EDGE + SPARK - lengthOf(bp, SPARK)
  const marks: SvgNode[] = []
  if (input.usualBp !== null) {
    const level = y(input.usualBp)
    marks.push(el('line', { x1: SPARK_EDGE, y1: level, x2: WIDTH - SPARK_EDGE, y2: level, ...RULE }))
  }
  const line = { stroke: '#4F46E5', 'stroke-width': 40, class: 'chart-trend-line' }
  marks.push(...runs(input.pointsBp, (i, bp) => [x(i), y(bp)], line, 50))
  const last = input.pointsBp[n - 1]
  if (n > 0 && last !== null && last !== undefined) marks.push(el('circle', { cx: x(n - 1), cy: y(last), r: 60, fill: '#4F46E5', class: 'chart-trend-last' }))
  // Drawn in its row's own small box, so always WIDTH across.
  return frame({ ...input, width: WIDTH }, SPARK + 2 * SPARK_EDGE, marks)
}
