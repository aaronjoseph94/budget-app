export { amortize } from './debt.js'
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
  resolvePlans,
  type PlanHistoryRow,
  type ResolvePlansInput,
  type ResolvePlansOutput,
  type ResolvedPlan,
} from './plans.js'

export {
  monthSheet,
  periodSheet,
  type MonthSheetInput,
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
} from './period-sheet.js'

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

/**
 * Date validation, re-exported so the app can make an IsoDate without importing
 * money-primitives — which apps/web may not do as a value, so that its money
 * arithmetic stays out of the UI (.dependency-cruiser.cjs). A date parser is
 * not arithmetic; routing it through core keeps that rule simple.
 */
export { isoDate } from '@budget/money-primitives'
