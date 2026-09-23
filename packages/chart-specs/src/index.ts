/**
 * chart-specs — chart layout and SVG as pure functions (CAPABILITY-MAP.md).
 *
 * A chart is a string, not a component, so the phone, the PDF and the Excel
 * export draw the same figure from the same function. No React, no DOM, no
 * chart library: geometry and markup only. Every percentage arrives from
 * packages/core in basis points, and this package turns basis points into
 * lengths and angles; it never divides money (invariant 1).
 */
export { escapeXml, type SvgMarkup } from './svg.js'
export type { ChartFrame } from './frame.js'
export { spendingDoughnut, type DoughnutInput, type DoughnutSlice } from './doughnut.js'
