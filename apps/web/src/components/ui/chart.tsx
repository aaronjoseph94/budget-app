import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { widthFor, type ChartFrame, type SvgMarkup } from '@budget/chart-specs'
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
 *
 * A chart's text scales with the box it is drawn in. Given `svg` as a
 * function of the units across to draw on, the chart measures its box and
 * is drawn on the width that shows its words at 13 px (chart-specs'
 * `widthFor`), so a chart in a 220 px column and one in a 450 px card read
 * alike, where they were 9 px and 18 px (V1, N127). Before it is measured,
 * and where the browser cannot measure, it is drawn at its designed width.
 * Callers still cap a chart's width (`max-w-sm`, `max-w-md`) so its bars
 * do not stretch across a desktop.
 */
export function SvgChart({
  svg,
  className,
}: {
  svg: SvgMarkup | ((width: number | undefined) => SvgMarkup)
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const fits = typeof svg === 'function'
  useLayoutEffect(() => {
    const el = box.current
    if (!fits || el === null || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const px = el.getBoundingClientRect().width
      if (px > 0) setWidth(widthFor(px))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [fits])
  const markup = useMemo(() => (typeof svg === 'function' ? svg(width) : svg), [svg, width])
  return <div ref={box} className={cn('w-full', className)} dangerouslySetInnerHTML={{ __html: markup }} />
}

/** A chart to be drawn on the width its box asks for (SvgChart). */
export type Fitted = (width: number | undefined) => SvgMarkup

/** `build` with everything but the width given now; SvgChart gives the width. */
export function fitted<I extends ChartFrame>(build: (input: I) => SvgMarkup, input: NoInfer<I>): Fitted {
  return (width) => build({ ...input, width })
}
