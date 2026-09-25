export { NeverPaidOff, amortize } from './debt.js'
export { debtPlan, type DatedExtraPayment, type DebtPlan, type DebtPlanInput, type PlannedDebt } from './debt-plan.js'
export { payoffStrategies, type PayoffStrategies, type PayoffStrategy, type StrategyOutcome } from './debt-strategy.js'
export { debtStatus, type DebtStanding, type DebtStatus, type DebtStatusInput, type DebtTotals } from './debt-status.js'
export type {
  AmortizeInput,
  AmortizeOutput,
  DebtInput,
  DebtSchedule,
  ExtraPaymentInput,
  ScheduleMonth,
} from './debt.js'

export {
  goalProgress,
  projectGoal,
  requiredWeeklyContribution,
  timeEquivalent,
} from './goal.js'
export type { SavingsGoal, GoalProgress, GoalProjection, TimeEquivalent } from './goal.js'

export {
  goalAtEnd,
  moveGoal,
  orderGoals,
  type GoalAtEndInput,
  type GoalStatus,
  type MoveGoalInput,
  type MoveGoalOutput,
  type OrderGoalsInput,
  type OrderedGoals,
  type PlacedGoal,
} from './goals.js'
export {
  goalsProgress,
  type GoalAmounts,
  type GoalFigures,
  type GoalsProgressInput,
  type GoalsProgressOutput,
} from './goals-progress.js'

export {
  goalForecast,
  type ForecastGoal,
  type GoalForecast,
  type GoalForecastInput,
  type GoalPace,
  type Paces,
} from './goal-forecast.js'
export { goalMilestones, type GoalMilestones, type GoalMilestonesInput } from './goal-milestones.js'
export { goalLevers, type GoalLevers, type GoalLeversInput, type Lever, type LeverKind } from './levers.js'

export {
  fundBalance,
  fundProgress,
  savingsFundPlan,
  savingsFunds,
  type FundBalance,
  type FundBalanceInput,
  type FundFigures,
  type FundGoal,
  type FundProgress,
  type SavingsFund,
  type SavingsFunds,
  type SavingsFundsInput,
  type SavingsFundPlan,
  type SavingsFundPlanInput,
  type SavingsPlanStatus,
} from './savings.js'

export {
  summariseImport,
  type ImportSummary,
  type ImportSummaryInput,
} from './import-summary.js'

export {
  appendToLists,
  endOfList,
  moveInList,
  type AppendToListsInput,
  type AppendToListsOutput,
  type EndOfListInput,
  type EndOfListOutput,
  type ListRow,
  type MoveInListInput,
  type MoveInListOutput,
} from './list-order.js'

export {
  resolveBudgets,
  type BudgetHistoryRow,
  type ResolveBudgetsInput,
  type ResolveBudgetsOutput,
  type ResolvedBudget,
} from './budgets.js'

export {
  billsTotals,
  resolvePlans,
  type BillsCategory,
  type BillsTotals,
  type BillsTotalsInput,
  type PlanHistoryRow,
  type ResolvePlansInput,
  type ResolvePlansOutput,
  type ResolvedPlan,
} from './plans.js'

export {
  monthSheet,
  paycheckSheet,
  periodSheet,
  weekSheet,
  type MonthSheetInput,
  type PaycheckSheet,
  type PaycheckSheetInput,
  type PeriodBlock,
  type PeriodBudget,
  type PeriodCategory,
  type PeriodEntry,
  type PeriodPlan,
  type PeriodRow,
  type PeriodSheet,
  type PeriodSheetInput,
  type SavingsBlock,
  type VariableBlock,
  type WeekCategory,
  type WeekSheet,
  type WeekSheetInput,
} from './period-sheet.js'

export {
  billCalendar,
  type BillCalendar,
  type BillCalendarInput,
  type CalendarBill,
  type CalendarDay,
  type CalendarPaySchedule,
  type CalendarWeek,
  type OwedKind,
  type Payday,
} from './bill-calendar.js'

export {
  expectedPay,
  type ExpectedPay,
  type ExpectedPayInput,
  type IncomeSchedule,
  type PayBasis,
  type PaySource,
} from './expected-pay.js'

export type { MonthForecastInput } from './month-position.js'
export { monthEndForecast, type MonthEndForecast, type Spread } from './month-end.js'
export { safeToSpend, type SafeToSpend } from './safe-to-spend.js'
export { scaleSeries, type ScaleSeriesInput, type ScaledSeries } from './scale.js'
export { forecastFact } from './digest.js'
export { cashFlow30, type CashFlow30, type CashFlowBill, type CashFlowPay } from './cash-flow-30.js'
export { cashFlowAhead, type AheadMonth, type CashFlowAhead } from './cash-flow-ahead.js'
export { whatIf, type WhatIf, type WhatIfGoal, type WhatIfInput } from './what-if.js'

export {
  PAYDAYS_A_YEAR,
  payPeriod,
  payShare,
  shiftPayPeriod,
  type PayFrequency,
  type PayPeriod,
  type PaySchedule,
} from './pay-period.js'

export {
  goalBars,
  partShares,
  stackedColumns,
  type GoalBar,
  type GoalBarsInput,
  type GoalBarsOutput,
  type PartSharesInput,
  type PartSharesOutput,
  type StackedColumnsInput,
  type StackedColumnsOutput,
  type StackedPart,
} from './shares.js'

export {
  yearSheet,
  type AtAGlance,
  type StartingBalance,
  type TopExpense,
  type YearFigure,
  type YearGroups,
  type YearMonth,
  type YearSheet,
  type YearSheetInput,
} from './year-sheet.js'

export {
  reconcileStatement,
  type Discrepancy,
  type Reconciliation,
  type ReconcileInput,
  type StatementSummary,
} from './statement-reconciliation.js'

export {
  SPENDING_LISTS,
  monthBounds,
  shiftMonth,
  shiftWeek,
  weekBounds,
  weeklySummary,
  type BudgetedCategory,
  type CategoryKind,
  type CategoryWeek,
  type LedgerEntry,
  type WeeklySummary,
  type WeeklySummaryInput,
} from './week.js'

export {
  completeMonths,
  evidenceOf,
  historyStart,
  type CompleteMonths,
  type CompleteMonthsInput,
  type Evidence,
  type HistoryStart,
  type HistoryStartInput,
} from './history.js'

export {
  monthlyTotals,
  savingsRate,
  type MonthTotals,
  type MonthlyTotalsInput,
  type SavingsRateInput,
  type Totals,
} from './month-totals.js'

export { biggestMovers, type BiggestMoversInput, type Mover, type MoverCategory } from './movers.js'

export {
  TREND_MONTHS,
  categoryTrends,
  monthlyTrend,
  trendLabel,
  type CategoryTrend,
  type MonthlyTrend,
  type TrendLabel,
  type TrendLabelInput,
  type TrendLine,
  type TrendWindowInput,
} from './trends.js'

export {
  monthReport,
  type LastMonth,
  type MonthReport,
  type MonthReportInput,
  type PairedRow,
  type TotalChange,
  type UsualTotals,
} from './month-report.js'

export { mad, median, quantile, type QuantileInput, type StatsInput } from './stats.js'

export {
  changeSize,
  notableBand,
  usualMonth,
  type ChangeSize,
  type NotableBandInput,
  type UsualMonth,
  type UsualMonthInput,
} from './notable.js'

export {
  budgetStanding,
  categoryPace,
  type BudgetStanding,
  type BudgetStandingInput,
  type CategoryPace,
  type CategoryPaceInput,
} from './pace.js'

export { dailyIndex, impactScore, type ImpactScore, type ImpactScoreInput } from './impact.js'

export {
  DIGEST_VERSION,
  factsDigest,
  type DigestGoal,
  type Fact,
  type FactKind,
  type FactsDigest,
  type FactsDigestInput,
  type Figure,
} from './digest.js'

export {
  comparisonWindow,
  debtBalanceChange,
  periodComparison,
  type BlockChange,
  type Change,
  type ComparisonWindow,
  type ComparisonWindowInput,
  type ComparedPeriod,
  type DebtBalanceChange,
  type DebtBalanceChangeInput,
  type DateWindow,
  type PeriodComparison,
  type PeriodComparisonInput,
  type RowChange,
} from './compare.js'

/**
 * Date validation, re-exported so the app can make an IsoDate without importing
 * money-primitives — which apps/web may not do as a value, so that its money
 * arithmetic stays out of the UI (.dependency-cruiser.cjs). A date parser is
 * not arithmetic; routing it through core keeps that rule simple.
 */
export { isoDate } from '@budget/money-primitives'
