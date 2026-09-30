/**
 * What every chart here shares: its frame, its title and description, and
 * fitting a name into a row.
 *
 * Geometry is on a grid of 10 units to the pixel a chart is designed at
 * (WIDTH is 300 px), so whole-number coordinates are finer than a screen
 * can show and nothing needs a fraction (svg.ts refuses one). The app scales
 * the drawing to its card; text scales with it.
 *
 * Colours are Mockup A's light ones (ADR 0010), written as attributes, so an
 * exported file keeps them with no stylesheet. Each mark also carries a `chart-…`
 * class, which is how the app's dark mode repaints it (index.css): a CSS
 * rule outranks a presentation attribute.
 */
import { type SvgChild, type SvgMarkup, el, finish } from './svg.js'

export const WIDTH = 3_000
/** Text size, 12 px at the designed width. */
export const FONT = 120
/**
 * About how wide a character is at FONT, rounded up for the widest system
 * sans. Only used to decide when a name must be shortened; a little too
 * generous shortens a name early, never lets it run off the chart.
 */
const CHAR = 70

export interface ChartFrame {
  /** Unique on the page: it names the title and description for a screen reader. */
  readonly id: string
  /** What the chart is, e.g. "Variable expenses by category". */
  readonly title: string
  /** Every value it draws, in words, for anyone who cannot see it. */
  readonly description: string
}

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * The outer `svg`: an image whose accessible name is its title and whose
 * description is its desc, both escaped text, sized in units and drawn at
 * a tenth of that in pixels unless the page scales it. Named and described
 * separately: naming it by both would read every value as its name.
 */
export function frame(chart: ChartFrame, height: number, children: readonly SvgChild[]): SvgMarkup {
  if (!ID.test(chart.id)) throw new RangeError(`A chart id must be letters, digits, "-" and "_": ${chart.id}`)
  return finish(
    el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${WIDTH} ${height}`,
        width: WIDTH / 10,
        height: Math.ceil(height / 10),
        role: 'img',
        'aria-labelledby': `${chart.id}-title`,
        'aria-describedby': `${chart.id}-desc`,
        class: 'spec-chart',
        'font-family': 'ui-sans-serif, system-ui, sans-serif',
        'font-size': FONT,
      },
      [
        el('title', { id: `${chart.id}-title` }, [chart.title]),
        el('desc', { id: `${chart.id}-desc` }, [chart.description]),
        ...children,
      ],
    ),
  )
}

/**
 * A name shortened with "…" to fit `units` beside what else is on its row.
 * The whole name stays in the chart's description and the mark's own title,
 * and in the table beside the chart. Counted in code points, so a name is
 * never cut through an emoji.
 */
export function fit(text: string, units: number): string {
  const chars = Array.from(text)
  const most = Math.floor(units / CHAR)
  if (chars.length <= most) return text
  return most <= 1 ? '…' : `${chars.slice(0, most - 1).join('')}…`
}

/** How much room a short piece of text such as an amount takes, as `fit` counts it. */
export function textUnits(text: string): number {
  return Array.from(text).length * CHAR
}

/**
 * A length of `span` units for `bp` basis points of it, half-up, in whole
 * units. Geometry, not money: the basis points came from packages/core.
 */
export function lengthOf(bp: number, span: number): number {
  if (!Number.isInteger(bp) || bp < 0)
    throw new RangeError(`Basis points must be a whole number from 0, received ${bp}`)
  return Math.floor((Math.min(bp, 10_000) * span + 5_000) / 10_000)
}
