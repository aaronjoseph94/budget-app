/**
 * The Year's round charts: the income, expenses and savings pie (Annual
 * chart41, Home chart3) and one top-3 ring (Home chart9–11).
 *
 * Every share arrives from core in basis points (F19): `partShares` for the
 * pie, F18's `shareBp` for a ring. Slices run clockwise from twelve o'clock
 * in the order given, as a spreadsheet pie draws its rows.
 *
 * The workbook drew it in two palettes, Annual's and Home's; Mockup A draws
 * both alike (ADR 0010, N124): Income's green, the neutral grey for
 * Expenses, which are no one list, and Savings' amber, and every
 * percentage in the legend in each one's ink. A part with no share
 * (nothing above zero) has no slice but keeps its legend row, so the three
 * are always named.
 */
import { FONT, WIDTH, type ChartFrame, fit, frame, lengthOf, textUnits } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface PieSlice {
  /** "Income", "Expenses", "Savings". Escaped; never markup. */
  readonly label: string
  /** Its amount and share as the page shows them, e.g. "$2,500.00 · 62%". */
  readonly valueText: string
  /** From core (`partShares`): 0–10,000, or null for no slice. */
  readonly shareBp: number | null
}

export interface PieInput extends ChartFrame {
  /** Where it is drawn: Annual's chart row (chart41) or Home's card (chart3). Both are Mockup A's colours. */
  readonly palette: 'annual' | 'home'
  /** Income, Expenses and Savings, in that order: the palette is by position. */
  readonly slices: readonly PieSlice[]
}

const MOCKUP_A = { fills: ['#10B981', '#9CA3AF', '#F59E0B'] }
const PALETTES = { annual: MOCKUP_A, home: MOCKUP_A } as const
/** Income's, the grey's and Savings' inks (ADR 0010), readable on the card. */
const INKS = [
  { fill: '#047857', class: 'chart-income-ink' },
  { fill: '#374151', class: 'chart-owed-ink' },
  { fill: '#B45309', class: 'chart-savings-ink' },
] as const

/** Slices parted by a line in the card's colour, as the donut's are. */
const GAP = { stroke: '#FFFFFF', 'stroke-width': 20, 'stroke-linejoin': 'round', class: 'chart-surface-gap' } as const
const R = 800
const CX = WIDTH / 2
const CY = R + 40
const ROW = 200
const SWATCH = 100

export function yearPie(input: PieInput): SvgMarkup {
  if (input.slices.length !== 3) throw new RangeError(`The Year's pie has three parts, received ${input.slices.length}`)
  const palette = PALETTES[input.palette]
  let from = 0
  const marks: SvgNode[] = []
  input.slices.forEach((s, i) => {
    if (s.shareBp === null) return
    // Half-up shares can add to a basis point over the whole (F17).
    const to = Math.min(from + lengthOf(s.shareBp, 10_000), 10_000)
    if (to > from) {
      marks.push(
        el('path', { d: sector(CX, CY, R, 0, from, to), fill: palette.fills[i]!, ...GAP, class: `chart-pie-${i} chart-surface-gap` }, [
          el('title', {}, [`${s.label}: ${s.valueText}`]),
        ]),
      )
    }
    from = to
  })
  const legendTop = CY + R + 200
  const legend = input.slices.map((s, i) => {
    const y = legendTop + i * ROW
    const room = WIDTH - SWATCH - 60 - textUnits(s.valueText) - 60
    const ink = INKS[i]!
    return el('g', {}, [
      el('rect', {
        x: 0,
        y: y - 90,
        width: SWATCH,
        height: SWATCH,
        rx: 20,
        fill: palette.fills[i]!,
        class: `chart-pie-${i}`,
      }),
      el('text', { x: SWATCH + 60, y, ...ink }, [fit(s.label, room)]),
      el('text', { x: WIDTH, y, 'text-anchor': 'end', ...ink, style: 'font-variant-numeric:tabular-nums' }, [
        s.valueText,
      ]),
    ])
  })
  return frame(input, legendTop + 2 * ROW + 60, [el('g', {}, marks), ...legend])
}

export interface ShareRingInput extends ChartFrame {
  /** From core (F18's `shareBp`): the category's part of the Year's spending. */
  readonly shareBp: number
  /** Which of the three it is, 0–2: Mockup A's orange, pink and violet. */
  readonly rank: number
  /** What the hole says, e.g. "57%". */
  readonly centreText: string
}

/**
 * The first three of Mockup A's chart hues (the donut's), by rank, in place
 * of Home chart9–11's coral, teal and sand (N124); the track is the grey of
 * a bar's empty part.
 */
export const TOP3_COLOURS = ['#F97316', '#EC4899', '#8B5CF6'] as const
const RING = 1400
const HOLE = 1050

/** One of the top 3 as Home draws it: its share of a ring, hole 75%, the rest the track. */
export function shareRing(input: ShareRingInput): SvgMarkup {
  const colour = TOP3_COLOURS[input.rank]
  if (colour === undefined) throw new RangeError(`A top-3 rank is 0, 1 or 2, received ${input.rank}`)
  const c = WIDTH / 2
  const share = lengthOf(input.shareBp, 10_000)
  const marks: SvgNode[] = [
    el('path', {
      d: sector(c, c, RING, HOLE, 0, 10_000),
      fill: '#E5E7EB',
      'fill-rule': 'evenodd',
      class: 'chart-ring-track',
    }),
  ]
  if (share > 0) marks.push(el('path', { d: sector(c, c, RING, HOLE, 0, share), fill: colour, 'fill-rule': 'evenodd' }))
  const text = {
    x: c,
    y: c + 180,
    'text-anchor': 'middle',
    'font-size': FONT * 5,
    fill: '#111827',
    class: 'chart-home-ink',
  }
  return frame(input, WIDTH, [...marks, el('text', text, [input.centreText])])
}

export interface DebtRingInput extends ChartFrame {
  /** From core (`debtStatus`'s progressBp): what is paid, 0–10,000. */
  readonly paidBp: number
  /** What the hole says, e.g. "45%". */
  readonly centreText: string
}

/**
 * The Debt Calculator's doughnut (I495:I496: Balance Paid, Remaining
 * Balance; holeSize 50) in Home's debt colours (D25): what is paid, #C8B6EB,
 * clockwise from twelve o'clock over a ring of what is left, #9171D7.
 */
export function debtRing(input: DebtRingInput): SvgMarkup {
  const c = WIDTH / 2
  const paid = lengthOf(input.paidBp, 10_000)
  const marks: SvgNode[] = [
    el('path', { d: sector(c, c, RING, RING / 2, 0, 10_000), fill: '#9171D7', 'fill-rule': 'evenodd', class: 'chart-debt-left' }),
  ]
  if (paid > 0) {
    marks.push(el('path', { d: sector(c, c, RING, RING / 2, 0, paid), fill: '#C8B6EB', 'fill-rule': 'evenodd', class: 'chart-debt-paid' }))
  }
  const text = { x: c, y: c + 150, 'text-anchor': 'middle', 'font-size': FONT * 4, fill: '#5B3FA8', class: 'chart-debt-ink' }
  return frame(input, WIDTH, [...marks, el('text', text, [input.centreText])])
}

/**
 * A slice of a circle, or of a ring when `inner` is above zero, between two
 * points of the whole in basis points clockwise from twelve o'clock. A whole
 * one is two halves, since an arc from a point back to itself draws nothing.
 */
function sector(cx: number, cy: number, outer: number, inner: number, fromBp: number, toBp: number): string {
  const at = (r: number, bp: number): [number, number] => {
    const angle = (bp / 10_000) * 2 * Math.PI
    return [cx + Math.round(r * Math.sin(angle)), cy - Math.round(r * Math.cos(angle))]
  }
  const [ox0, oy0] = at(outer, fromBp)
  const [ox1, oy1] = at(outer, toBp)
  if (toBp - fromBp >= 10_000 || (toBp - fromBp > 5_000 && ox0 === ox1 && oy0 === oy1)) {
    const circle = (r: number) => {
      const [x0, y0] = at(r, 0)
      const [x1, y1] = at(r, 5_000)
      return `M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1} A${r} ${r} 0 0 1 ${x0} ${y0} Z`
    }
    return inner > 0 ? `${circle(outer)} ${circle(inner)}` : circle(outer)
  }
  const large = toBp - fromBp > 5_000 ? 1 : 0
  const rim = `M${ox0} ${oy0}A${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1}`
  if (inner === 0) return `${rim}L${cx} ${cy}Z`
  const [ix1, iy1] = at(inner, toBp)
  const [ix0, iy0] = at(inner, fromBp)
  return `${rim}L${ix1} ${iy1}A${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0}Z`
}
