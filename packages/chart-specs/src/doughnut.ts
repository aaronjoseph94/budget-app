/**
 * The workbook's Variable-expenses doughnut (Jan chart13): one slice per category,
 * sized by its share of the month's spending, with a legend underneath.
 *
 * Colour follows the category's row on its list, as chart13's colours follow
 * the row (dPt idx 0–22), so a category keeps its colour whichever others
 * have spending. Mockup A's six hues take the place of the workbook's 23
 * corals, and the seventh row starts them again, so two rows six apart share
 * a hue: slices are parted by a gap in the card's colour and each is named in
 * the legend, so colour is never the only way to tell them apart.
 *
 * Slices run clockwise from twelve o'clock in list order, as a spreadsheet
 * doughnut draws its rows, and the hole is half the ring (holeSize 50).
 */
import { WIDTH, type ChartFrame, fit, frame, lengthOf, textUnits } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

/**
 * Mockup A's six chart hues (ADR 0010, step 3): orange, pink, violet, blue,
 * teal and green, the palette its Variable-expenses donut draws. Written
 * into the file itself, so a chart saved out of the page keeps them (N124).
 */
export const SLICE_HUES = ['#F97316', '#EC4899', '#8B5CF6', '#3B82F6', '#14B8A6', '#22C55E'] as const

export interface DoughnutSlice {
  /** The category's name, as typed. Escaped; never markup. */
  readonly label: string
  /** Its amount and share as the page shows them, e.g. "$615.66 · 48%". */
  readonly valueText: string
  /** From core (`shareBp`): its part of the whole, 0–10,000. */
  readonly shareBp: number
  /** Its row on its list, from 0, which picks its colour. */
  readonly listIndex: number
}

export interface DoughnutInput extends ChartFrame {
  /** In the order the ring and legend show them. */
  readonly slices: readonly DoughnutSlice[]
}

const OUTER = 700
const INNER = 350
const CX = WIDTH / 2
const CY = OUTER + 20
/** The card's colour between slices: 2 px at the designed size. */
const GAP = 20
const ROW = 200
const SWATCH = 100

export function hueFor(listIndex: number): string {
  if (!Number.isInteger(listIndex) || listIndex < 0)
    throw new RangeError(`A list position must be a whole number from 0, received ${listIndex}`)
  return SLICE_HUES[listIndex % SLICE_HUES.length]!
}

export function spendingDoughnut(input: DoughnutInput): SvgMarkup {
  const legendTop = CY + OUTER + 120
  const height = legendTop + input.slices.length * ROW
  let from = 0
  const slices: SvgNode[] = []
  for (const s of input.slices) {
    // Half-up shares can add to a few basis points over the whole, half a
    // basis point a row at most (F17); the ring stops at the whole.
    const to = Math.min(from + lengthOf(s.shareBp, 10_000), 10_000)
    if (to > from) {
      const d = ring(from, to)
      slices.push(
        el('path', { d, fill: hueFor(s.listIndex), ...SURFACE }, [el('title', {}, [`${s.label}: ${s.valueText}`])]),
      )
    }
    from = to
  }
  // Nothing to share: the empty ring the workbook's chart draws with every Actual
  // at 0, in the list's tile so it reads as waiting, not as a slice.
  const track = { d: ring(0, 10_000), 'fill-rule': 'evenodd', fill: '#FFEDD5', class: 'chart-variable-track' }
  const body = slices.length > 0 ? slices : [el('path', track)]
  const legend = input.slices.map((s, i) => {
    const y = legendTop + i * ROW
    const room = WIDTH - SWATCH - 60 - textUnits(s.valueText) - 60
    return el('g', {}, [
      el('title', {}, [`${s.label}: ${s.valueText}`]),
      el('rect', { x: 0, y: y - 90, width: SWATCH, height: SWATCH, rx: 20, fill: hueFor(s.listIndex) }),
      el('text', { x: SWATCH + 60, y, fill: INK, class: 'chart-variable-ink' }, [fit(s.label, room)]),
      el(
        'text',
        {
          x: WIDTH,
          y,
          'text-anchor': 'end',
          fill: INK,
          class: 'chart-variable-ink',
          style: 'font-variant-numeric:tabular-nums',
        },
        [s.valueText],
      ),
    ])
  })
  return frame(input, height + 40, [el('g', {}, body), ...legend])
}

/** Variable expenses' ink (ADR 0010), readable on the card. */
const INK = '#C2410C'
const SURFACE = {
  'fill-rule': 'evenodd',
  stroke: '#FFFFFF',
  'stroke-width': GAP,
  'stroke-linejoin': 'round',
  class: 'chart-surface-gap',
} as const

/**
 * The ring between two points of the whole, in basis points clockwise from
 * twelve o'clock. A whole ring is two half rings, since an arc from a point
 * back to itself draws nothing.
 */
function ring(fromBp: number, toBp: number): string {
  const [ox0, oy0] = point(OUTER, fromBp)
  const [ox1, oy1] = point(OUTER, toBp)
  // Nearly all of it can round to the very point it started from on the
  // grid, and would then vanish; it is drawn whole instead.
  if (toBp - fromBp >= 10_000 || (toBp - fromBp > 5_000 && ox0 === ox1 && oy0 === oy1)) {
    return `${arc(OUTER, 0, 5_000, true)} ${arc(OUTER, 5_000, 10_000, false)} Z ${arc(INNER, 0, 5_000, true)} ${arc(INNER, 5_000, 10_000, false)} Z`
  }
  const large = toBp - fromBp > 5_000 ? 1 : 0
  const [ix1, iy1] = point(INNER, toBp)
  const [ix0, iy0] = point(INNER, fromBp)
  return `M${ox0} ${oy0}A${OUTER} ${OUTER} 0 ${large} 1 ${ox1} ${oy1}L${ix1} ${iy1}A${INNER} ${INNER} 0 ${large} 0 ${ix0} ${iy0}Z`
}

/** Half a circle of radius `r`, as the pieces of a whole ring. */
function arc(r: number, fromBp: number, toBp: number, move: boolean): string {
  const [x0, y0] = point(r, fromBp)
  const [x1, y1] = point(r, toBp)
  return `${move ? `M${x0} ${y0}` : ''}A${r} ${r} 0 0 1 ${x1} ${y1}`
}

/** Where `bp` of the way round a circle of radius `r` falls, rounded to the grid. */
function point(r: number, bp: number): [number, number] {
  const angle = (bp / 10_000) * 2 * Math.PI
  return [CX + Math.round(r * Math.sin(angle)), CY - Math.round(r * Math.cos(angle))]
}
