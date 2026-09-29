/**
 * The month in review's this month against last (plan §7, F36): for each
 * category, two bars one above the other, this month's darker, each with
 * its amount at the end of the row. Every length arrives in basis points
 * from core's monthReport, on one scale for every bar, so the rows compare;
 * nothing here divides money. The same figures are the list beside it and
 * its description.
 */
import { FONT, WIDTH, type ChartFrame, fit, frame, lengthOf } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface PairedBar {
  /** The category's name, as typed. Escaped; never markup. */
  readonly label: string
  /** This month's and last month's amounts as the page shows them, e.g. "$560.00". */
  readonly nowText: string
  readonly beforeText: string
  /** Each bar's length, placed by core; 0 draws no bar. */
  readonly nowBp: number
  readonly beforeBp: number
}

export interface PairedBarsInput extends ChartFrame {
  /** What the two bars are, e.g. "August" and "July", or "1–24 Sep" and "1–24 Aug". */
  readonly nowName: string
  readonly beforeName: string
  readonly rows: readonly PairedBar[]
}

const KEY = 220
const ROW = 460
const BAR = 100
const ROUND = 40
/** Room at the end of each bar for its amount. */
const AMOUNT = 900

const INK = { fill: '#6B7280', class: 'chart-forecast-ink' } as const
const NOW = { fill: '#4F46E5', class: 'chart-report-now' } as const
const BEFORE = { fill: '#A7A3F2', class: 'chart-report-before' } as const

export function pairedBars(input: PairedBarsInput): SvgMarkup {
  const rows = input.rows.map((r, i) => row(r, KEY + i * ROW, input))
  return frame(input, KEY + input.rows.length * ROW + 20, [key(input.nowName, input.beforeName), ...rows])
}

/** Two series, so a key names them: colour is never the only way to tell them apart. */
function key(nowName: string, beforeName: string): SvgNode {
  const half = WIDTH / 2
  return el('g', {}, [
    el('rect', { x: 0, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...NOW }),
    el('text', { x: 160, y: FONT, ...INK }, [fit(nowName, half - 260)]),
    el('rect', { x: half, y: 30, width: BAR, height: BAR, rx: ROUND / 2, ...BEFORE }),
    el('text', { x: half + 160, y: FONT, ...INK }, [fit(beforeName, half - 160)]),
  ])
}

function row(bar: PairedBar, top: number, names: PairedBarsInput): SvgNode {
  const span = WIDTH - AMOUNT
  const line = (bp: number, y: number, paint: typeof NOW | typeof BEFORE, text: string): SvgNode[] => {
    const length = lengthOf(bp, span)
    const marks: SvgNode[] = []
    if (length > 0) marks.push(el('rect', { x: 0, y, width: length, height: BAR, rx: ROUND, ...paint }))
    marks.push(el('text', { x: length + 60, y: y + 90, ...INK, style: 'font-variant-numeric:tabular-nums' }, [fit(text, AMOUNT - 60)]))
    return marks
  }
  return el('g', {}, [
    el('title', {}, [`${bar.label}: ${names.nowName} ${bar.nowText}, ${names.beforeName} ${bar.beforeText}`]),
    el('text', { x: 0, y: top + 120, ...INK }, [fit(bar.label, WIDTH)]),
    ...line(bar.nowBp, top + 170, NOW, bar.nowText),
    ...line(bar.beforeBp, top + 300, BEFORE, bar.beforeText),
  ])
}
