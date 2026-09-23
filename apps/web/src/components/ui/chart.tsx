import type { SvgMarkup } from '@budget/chart-specs'
import { cn } from '../../lib/cn.js'

/**
 * A chart from packages/chart-specs, put into the page as the SVG it is.
 *
 * This is the one place the app writes markup from a string, and eslint
 * refuses `dangerouslySetInnerHTML` anywhere else. It is safe here, and
 * only here, because of what `SvgMarkup` is: a string only chart-specs
 * makes, every element of it built by that package's own `el`, which
 * escapes every text node and attribute value on the way in. A category
 * name inside it is escaped text — "Fun & <Games>" arrives as
 * `Fun &amp; &lt;Games&gt;` — so no name, typed or imported, can open a tag
 * (CLAUDE.md: never render ingested text as markup). chart-specs tests that
 * with `<` and `&` in a name, and the Month's tests check the page for it.
 *
 * Why a string at all, and not elements React builds: the same function
 * draws the chart for the planned PDF and Excel export (CAPABILITY-MAP.md),
 * so the figure on the phone is the figure in the report. A second renderer
 * here would be a second place for them to differ.
 *
 * The type is the guard: a plain string does not fit `SvgMarkup`, and
 * eslint refuses `as SvgMarkup` in the app.
 */
export function SvgChart({ svg, className }: { svg: SvgMarkup; className?: string }) {
  return <div className={cn('w-full', className)} dangerouslySetInnerHTML={{ __html: svg }} />
}
