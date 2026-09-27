/**
 * The spending grid (plan §2.6, §7; F40): a week to a column and a weekday
 * to a row, each day a square in one of five levels from core
 * (`spendingGrid`), the "contribution grid" the ROADMAP promised.
 *
 * One hue from light to dark, as a sequential scale should be, with "none"
 * a neutral so a day with no spending never reads as a little. A day not
 * given (before the records, or still to come) is not drawn at all, never
 * as a level. Every square carries its own title, the key runs from less
 * to more, and the page lists the same figures beside the chart, so colour
 * is never the only way to read it. Nothing here divides money: the levels
 * arrive decided.
 */
import { FONT, type ChartFrame, frame, textUnits } from './frame.js'
import { type SvgMarkup, type SvgNode, el } from './svg.js'

export interface HeatCell {
  /** 0 none, 1 up to half, 2 up to all, 3 up to one and a half, 4 more (F40). */
  readonly level: 0 | 1 | 2 | 3 | 4
  /** The day and its figure, e.g. "Mon 10 Aug: $20.00". Escaped; never markup. */
  readonly title: string
}

export interface HeatGridInput extends ChartFrame {
  /** Oldest first; each Monday to Sunday, null for a day not drawn. */
  readonly weeks: readonly (readonly (HeatCell | null)[])[]
  /** One per row, Monday first; an empty one is left off. */
  readonly rowLabels: readonly string[]
  /** Under the first column, and the last when there is room. */
  readonly startText: string
  readonly endText: string
}

const LABEL = 360
/** Room above the first row, so its label's ascenders are not cut off by the frame. */
const TOP = 40
const PITCH = 100
const CELL = 80
const ROUND = 16
const DATES = TOP + 7 * PITCH + FONT
const KEY = DATES + 60
/** The last column is named only from this many weeks, so it never runs into the first. */
const ROOM = 6

const INK = { fill: '#5B6773', class: 'chart-forecast-ink' } as const
const LEVELS = [
  { fill: '#E8E5E1', class: 'chart-heat-0' },
  { fill: '#EBA591', class: 'chart-heat-1' },
  { fill: '#DA6448', class: 'chart-heat-2' },
  { fill: '#A42F1A', class: 'chart-heat-3' },
  { fill: '#5E120D', class: 'chart-heat-4' },
] as const

function paint(level: number): (typeof LEVELS)[number] {
  const p = LEVELS[level]
  if (!Number.isInteger(level) || p === undefined) throw new RangeError(`A grid level must be 0 to 4, received ${level}`)
  return p
}

function square(x: number, y: number, level: number, children: readonly SvgNode[] = []): SvgNode {
  return el('rect', { x, y, width: CELL, height: CELL, rx: ROUND, ...paint(level) }, children)
}

export function heatGrid(input: HeatGridInput): SvgMarkup {
  const marks: SvgNode[] = []
  input.rowLabels.forEach((label, row) => {
    if (label !== '') marks.push(el('text', { x: 0, y: TOP + row * PITCH + 70, ...INK }, [label]))
  })
  input.weeks.forEach((days, col) => {
    days.forEach((cell, row) => {
      if (cell !== null) marks.push(square(LABEL + col * PITCH, TOP + row * PITCH, cell.level, [el('title', {}, [cell.title])]))
    })
  })
  marks.push(el('text', { x: LABEL, y: DATES, ...INK }, [input.startText]))
  const n = input.weeks.length
  if (n >= ROOM) marks.push(el('text', { x: LABEL + n * PITCH - (PITCH - CELL), y: DATES, 'text-anchor': 'end', ...INK }, [input.endText]))
  marks.push(key())
  return frame(input, KEY + PITCH + 20, marks)
}

/** Less, the five levels in order, more. */
function key(): SvgNode {
  const first = LABEL + textUnits('Less') + 60
  return el('g', {}, [
    el('text', { x: LABEL, y: KEY + 70, ...INK }, ['Less']),
    ...LEVELS.map((_, level) => square(first + level * PITCH, KEY, level)),
    el('text', { x: first + (LEVELS.length - 1) * PITCH + CELL + 80, y: KEY + 70, ...INK }, ['More']),
  ])
}
