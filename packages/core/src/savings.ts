/**
 * Workbook's Savings tab: what each fund still needs, and what to put in it a
 * month to get there by its goal date.
 *
 * Excel semantics (docs/formula-decisions.md F21, F9; divergences D15, D22):
 *
 * - Amount needed. `Savings!B9 =SUM(B7-B5)`: the goal less the current
 *   amount, with no floor, so a fund past its goal shows by how much.
 * - Months remaining. `V14 =IF(OR(ISBLANK(N14),ISBLANK(R14)),"",
 *   DATEDIF(N14,R14,"M"))`: whole months from the typed start date to the
 *   goal date. From the start date, not from today, so it never reads a
 *   clock; `monthsBetween` is DATEDIF.
 * - Monthly contribution. `Z14 =IFERROR((F14-J14)/V14, 0)`: the amount
 *   needed over the months, which Workbook keeps as a fraction (88.9047619) and
 *   the app rounds up to the cent (F9), so saving it every month reaches the
 *   goal on time.
 * - Where IFERROR shows $0 the engine returns no contribution and says why:
 *   no dates (D15), a goal date before the start (V14 `#NUM!`), or less than
 *   a whole month after it (V14 0) (D22). $0 a month would read as nothing
 *   left to save.
 *
 * The current amount is given, not worked out here: on the Savings screen it
 * is `fundBalance` (D16), the typed amount plus the transfers since.
 */
import { type Cents, type IsoDate, cents, monthsBetween, subCents } from '@budget/money-primitives'

export interface SavingsFundPlanInput {
  /** Savings!B7, the Goal Amount. */
  readonly goalCents: number
  /** Savings!B5, the Current Amount: the fund's balance on the day it is read (D16). */
  readonly currentCents: number
  /** Savings!N14, the Start Date; null when not typed. */
  readonly startDate: IsoDate | null
  /** Savings!R14, the Goal Date; null when not typed. */
  readonly goalDate: IsoDate | null
}

/**
 * Why there is, or is not, a monthly contribution:
 * `'planned'` there is one; `'no-dates'` a date is missing (D15);
 * `'goal-before-start'` the goal date is before the start date (D22);
 * `'under-a-month'` the goal date is less than a whole month after it (D22).
 */
export type SavingsPlanStatus = 'planned' | 'no-dates' | 'goal-before-start' | 'under-a-month'

export interface SavingsFundPlan {
  /** Savings!B9: goal − current. Below zero once the goal is passed. */
  readonly amountNeededCents: Cents
  /** Savings!V14, or null with no dates or a goal date before the start. */
  readonly monthsRemaining: number | null
  /** Savings!Z14, rounded up to the cent (F9); null unless `status` is 'planned'. */
  readonly monthlyContributionCents: Cents | null
  readonly status: SavingsPlanStatus
}

export function savingsFundPlan(input: SavingsFundPlanInput): SavingsFundPlan {
  const needed = subCents(cents(input.goalCents), cents(input.currentCents))
  const none = (status: SavingsPlanStatus, monthsRemaining: number | null = null): SavingsFundPlan => ({
    amountNeededCents: needed,
    monthsRemaining,
    monthlyContributionCents: null,
    status,
  })
  if (input.startDate === null || input.goalDate === null) return none('no-dates')
  if (input.goalDate < input.startDate) return none('goal-before-start')
  const months = monthsBetween(input.startDate, input.goalDate)
  if (months === 0) return none('under-a-month', 0)
  return { amountNeededCents: needed, monthsRemaining: months, monthlyContributionCents: ceilDiv(needed, months), status: 'planned' }
}

/**
 * `amount / by` rounded up, in integers. The remainder is exact for whole
 * cents, so no float quotient can land a hair either side of a whole cent.
 * Up means towards more saving: a fund past its goal (a negative amount)
 * rounds towards zero.
 */
function ceilDiv(amount: Cents, by: number): Cents {
  const rest = amount % by
  const whole = (amount - rest) / by
  return cents(rest > 0 ? whole + 1 : whole)
}
