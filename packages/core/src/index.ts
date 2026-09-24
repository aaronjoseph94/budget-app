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

export { historyStart, type HistoryStart, type HistoryStartInput } from './history.js'

export {
  comparisonWindow,
  type ComparisonWindow,
  type ComparisonWindowInput,
  type DateWindow,
} from './compare.js'

/**
 * Date validation, re-exported so the app can make an IsoDate without importing
 * money-primitives — which apps/web may not do as a value, so that its money
 * arithmetic stays out of the UI (.dependency-cruiser.cjs). A date parser is
 * not arithmetic; routing it through core keeps that rule simple.
 */
export { isoDate } from '@budget/money-primitives'
