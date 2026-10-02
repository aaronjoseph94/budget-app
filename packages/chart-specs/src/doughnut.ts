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
import { type ChartFrame, fit, frame, lengthOf, sector, textUnits, widthOf } from './frame.js'
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
  const width = widthOf(input)
  const cx = width / 2
  const legendTop = CY + OUTER + 120
  const height = legendTop + input.slices.length * ROW
  let from = 0
  const slices: SvgNode[] = []
  for (const s of input.slices) {
    // Half-up shares can add to a few basis points over the whole, half a
    // basis point a row at most (F17); the ring stops at the whole.
    const to = Math.min(from + lengthOf(s.shareBp, 10_000), 10_000)
    if (to > from) {
      const d = sector(cx, CY, OUTER, INNER, from, to)
      slices.push(
        el('path', { d, fill: hueFor(s.listIndex), ...SURFACE }, [el('title', {}, [`${s.label}: ${s.valueText}`])]),
      )
    }
    from = to
  }
  // Nothing to share: the empty ring the workbook's chart draws with every Actual
  // at 0, in the list's tile so it reads as waiting, not as a slice.
  const track = { d: sector(cx, CY, OUTER, INNER, 0, 10_000), 'fill-rule': 'evenodd', fill: '#FFEDD5', class: 'chart-variable-track' }
  const body = slices.length > 0 ? slices : [el('path', track)]
  const legend = input.slices.map((s, i) => {
    const y = legendTop + i * ROW
    const room = width - SWATCH - 60 - textUnits(s.valueText) - 60
    return el('g', {}, [
      el('title', {}, [`${s.label}: ${s.valueText}`]),
      el('rect', { x: 0, y: y - 90, width: SWATCH, height: SWATCH, rx: 20, fill: hueFor(s.listIndex) }),
      el('text', { x: SWATCH + 60, y, ...NAME }, [fit(s.label, room)]),
      el(
        'text',
        {
          x: width,
          y,
          'text-anchor': 'end',
          ...FIGURE,
          style: 'font-variant-numeric:tabular-nums',
        },
        [s.valueText],
      ),
    ])
  })
  return frame(input, height + 40, [el('g', {}, body), ...legend])
}

/**
 * The legend as Mockup A's Month writes it (Month.dc.html): each name in the
 * ink and its figure muted, where every word was once Variable's orange
 * (V5). The slices and swatches carry the hue.
 */
const NAME = { fill: '#111827', class: 'chart-ink' } as const
const FIGURE = { fill: '#6B7280', class: 'chart-forecast-ink' } as const
const SURFACE = {
  'fill-rule': 'evenodd',
  stroke: '#FFFFFF',
  'stroke-width': GAP,
  'stroke-linejoin': 'round',
  class: 'chart-surface-gap',
} as const
