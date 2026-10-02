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
import { type SvgChild, type SvgMarkup, type SvgNode, el, finish } from './svg.js'

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
  /**
   * Units across, WIDTH when not given. Text is FONT units however wide
   * the drawing, so the page draws a chart in a narrow card on fewer units
   * and one in a wide card on more, and its words show at one size
   * wherever it sits (V1, N127). Heights do not change with it.
   */
  readonly width?: number | undefined
}

/** The narrowest a chart is drawn: the pie's 1,600 across, with room. */
export const NARROWEST = 2_000
export const WIDEST = 5_000

/** The size a chart's words show at on the page, in px: the mockup's 12 to 14. */
export const TEXT_PX = 13

/**
 * The units across that show a chart's text at TEXT_PX in a box `px` wide,
 * to the nearest ten, within NARROWEST and WIDEST. Geometry, not money.
 */
export function widthFor(px: number): number {
  if (!Number.isFinite(px)) return NARROWEST
  const units = Math.round((px * FONT) / TEXT_PX / 10) * 10
  return Math.min(WIDEST, Math.max(NARROWEST, units))
}

/** The units across a chart is drawn on, checked. */
export function widthOf(chart: ChartFrame): number {
  const width = chart.width ?? WIDTH
  if (!Number.isInteger(width) || width % 10 !== 0 || width < NARROWEST || width > WIDEST)
    throw new RangeError(`A chart is ${NARROWEST} to ${WIDEST} units across in tens, received ${width}`)
  return width
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
  const width = widthOf(chart)
  return finish(
    el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${width} ${height}`,
        width: width / 10,
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

/**
 * A slice of a circle, or of a ring when `inner` is above zero, between two
 * points of the whole in basis points clockwise from twelve o'clock. A whole
 * one is two halves, since an arc from a point back to itself draws nothing.
 */
export function sector(cx: number, cy: number, outer: number, inner: number, fromBp: number, toBp: number): string {
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

/** Two series named, swatch then name: colour is never the only way to tell them apart. */
export function seriesKey(series: readonly (readonly [string, { readonly fill: string; readonly class: string }])[], ink: { readonly fill: string; readonly class: string }): SvgNode {
  const SWATCH = 100
  let x = 0
  const marks = series.flatMap(([name, colours]) => {
    const at = x
    x += SWATCH + 60 + textUnits(name) + 100
    return [el('rect', { x: at, y: 30, width: SWATCH, height: SWATCH, rx: 20, ...colours }), el('text', { x: at + SWATCH + 60, y: FONT, ...ink }, [name])]
  })
  return el('g', {}, marks)
}

/** The x of point i of n, evenly across, on whole units. */
export function across(i: number, n: number, edge: number, span: number): number {
  return n < 2 ? edge : edge + Math.floor((2 * i * span + (n - 1)) / (2 * (n - 1)))
}
