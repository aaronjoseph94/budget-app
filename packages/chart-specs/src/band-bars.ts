/**
 * The Forecast's next three months (plan §2.5, F35): a bar a month for the
 * most likely figure, from $0, inside a pale band from the worst case to
 * the best. A rough month has one figure, so no band. Every place arrives
 * in basis points from core's scaleSeries, with $0 on the scale; nothing
 * here divides money. The figures are also the table beside the chart and
 * its description.
 */
import { FONT, WIDTH, type ChartFrame, fit, frame, lengthOf, textUnits } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface BandColumn {
  /** The month, e.g. "Oct". Escaped; never markup. */
  readonly label: string
  /** The most likely figure as the page shows it, e.g. "$4,620". */
  readonly valueText: string
  /** Worst, most likely and best, each placed by core. */
  readonly lowBp: number
  readonly midBp: number
  readonly highBp: number
}

export interface BandBarsInput extends ChartFrame {
  readonly columns: readonly BandColumn[]
  /** Where $0 sits: the bars start there. */
  readonly zeroBp: number
}

const KEY = 220
const TOP = KEY + 200
const PLOT = 1_200
const BASE = TOP + PLOT
const SWATCH = 100

const INK = { fill: '#6B7280', class: 'chart-forecast-ink' } as const
const BAND = { fill: '#CAC7F7', class: 'chart-forecast-band' } as const
const BAR = { fill: '#4F46E5', class: 'chart-forecast-range' } as const

export function bandBars(input: BandBarsInput): SvgMarkup {
  const y = (bp: number) => BASE - lengthOf(bp, PLOT)
  const zero = y(input.zeroBp)
  const step = Math.floor(WIDTH / Math.max(input.columns.length, 1))
  const band = Math.floor((step * 3) / 5)
  const bar = Math.floor((step * 2) / 5)
  const columns = input.columns.map((c, i) => {
    const left = i * step
    const centre = left + Math.floor(step / 2)
    const marks: SvgNode[] = []
    if (c.highBp > c.lowBp) {
      marks.push(el('rect', { x: left + Math.floor((step - band) / 2), y: y(c.highBp), width: band, height: y(c.lowBp) - y(c.highBp), rx: 40, ...BAND }))
    }
    const mid = y(c.midBp)
    if (mid !== zero) {
      marks.push(el('rect', { x: left + Math.floor((step - bar) / 2), y: Math.min(mid, zero), width: bar, height: Math.abs(zero - mid), ...BAR }))
    }
    marks.push(el('text', { x: centre, y: Math.min(y(c.highBp), zero) - 60, 'text-anchor': 'middle', ...INK, style: 'font-variant-numeric:tabular-nums' }, [fit(c.valueText, step)]))
    marks.push(el('text', { x: centre, y: BASE + 160, 'text-anchor': 'middle', ...INK }, [fit(c.label, step)]))
    return el('g', {}, [el('title', {}, [`${c.label}: ${c.valueText}`]), ...marks])
  })
  return frame(input, BASE + 220, [
    key(),
    el('line', { x1: 0, y1: zero, x2: WIDTH, y2: zero, stroke: '#6B7280', 'stroke-width': 10, class: 'chart-forecast-rule' }),
    ...columns,
  ])
}

/** The two marks named, so colour is never the only way to tell them apart. */
function key(): SvgNode {
  let x = 0
  const marks = (
    [
      ['Most likely', BAR],
      ['Worst to best case', BAND],
    ] as const
  ).flatMap(([name, colours]) => {
    const at = x
    x += SWATCH + 60 + textUnits(name) + 100
    return [el('rect', { x: at, y: 30, width: SWATCH, height: SWATCH, rx: 20, ...colours }), el('text', { x: at + SWATCH + 60, y: FONT, ...INK }, [name])]
  })
  return el('g', {}, marks)
}
