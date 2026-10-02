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
export { widthFor, type ChartFrame } from './frame.js'
export { spendingDoughnut, type DoughnutInput, type DoughnutSlice } from './doughnut.js'
export { debtBars, incomeBars, savingsGoalBars, weekdayBars, type IncomeBar, type IncomeBarsInput } from './bars.js'
export { debtRing, shareRing, yearPie, type DebtRingInput, type PieInput, type PieSlice, type ShareRingInput } from './pie.js'
export {
  goalActualColumns,
  incomeExpenseColumns,
  type ColumnPart,
  type GoalActualGroup,
  type GoalActualInput,
  type IncomeExpenseInput,
  type MonthColumn,
} from './columns.js'
export { rangeBar, type RangeBarInput } from './range-bar.js'
export { balanceLine, type BalanceLineInput } from './balance-line.js'
export { bandBars, type BandBarsInput, type BandColumn } from './band-bars.js'
export { pairedBars, type PairedBar, type PairedBarsInput } from './paired-bars.js'
export { sparkline, trendLines, type SparklineInput, type TrendLinesInput, type TrendSeries } from './trend-lines.js'
export { heatGrid, type HeatCell, type HeatGridInput } from './heat-grid.js'
