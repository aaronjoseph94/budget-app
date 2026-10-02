/**
 * The workbook's Savings tab: what each fund still needs, and what to put in it a
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
 *   needed over the months, which the workbook keeps as a fraction (88.9047619) and
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
import { type Cents, type IsoDate, ZERO_CENTS, addCents, cents, monthsBetween, subCents, sumCents } from '@budget/money-primitives'
import { shareOf } from './shares.js'
import { byName } from './order.js'

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

export interface FundBalanceInput {
  /** What was typed as the fund's balance (savings_goals.saved_cents). */
  readonly typedCents: number
  /** The day the typed amount was true, at its end (0013's balance_as_of). */
  readonly typedOn: IsoDate
  /** The day the balance is wanted for. */
  readonly asOf: IsoDate
  /** Ledger rows in the fund's Savings-list category, signed as the ledger is (D3). */
  readonly entries: readonly { readonly postedOn: IsoDate; readonly amountCents: number }[]
}

export interface FundBalance {
  readonly balanceCents: Cents
  /** What moved in after the typed day, less what came back out. */
  readonly transfersCents: Cents
}

/**
 * A fund's balance, typed once and kept by transfers (D16, owner's choice):
 * the typed amount plus every row after the day it was typed, up to `asOf`.
 * A row on the typed day is already in the typed amount. Money into
 * savings is a negative ledger row, as on the Month (D3), so it adds; money
 * taken back out subtracts.
 */
export function fundBalance(input: FundBalanceInput): FundBalance {
  const moved = sumCents(
    input.entries
      .filter((e) => e.postedOn > input.typedOn && e.postedOn <= input.asOf)
      .map((e) => cents(e.amountCents)),
  )
  // Subtracted from zero, not negated, so no transfers is 0 and not -0.
  const transfers = subCents(ZERO_CENTS, moved)
  return { balanceCents: addCents(cents(input.typedCents), transfers), transfersCents: transfers }
}

export interface FundProgress {
  /** The balance as a share of the goal, 0 to 10,000; the bar's length. */
  readonly progressBp: number
  /** The goal is met or passed: Savings!B9 is zero or below. */
  readonly reached: boolean
}

/**
 * How far along a fund's bar is. Half-up to a basis point as the charts'
 * shares are (F17); a balance at or below zero draws nothing, and one past
 * its goal the whole bar.
 */
export function fundProgress(input: { readonly goalCents: number; readonly balanceCents: number }): FundProgress {
  const goal = cents(input.goalCents)
  const balance = cents(input.balanceCents)
  if (goal <= 0) throw new RangeError('A savings goal must be above zero')
  return {
    progressBp: balance <= 0 ? 0 : balance >= goal ? 10_000 : shareOf(balance, goal),
    reached: balance >= goal,
  }
}

/** A savings_goals row as the Savings screen reads it (0004, 0013). */
export interface FundGoal {
  readonly id: string
  /** The Savings-list category it is the fund for; null for a goal on no fund yet. */
  readonly categoryId: string | null
  readonly goalCents: number
  readonly typedCents: number
  /** When `typedCents` was true; 0013 requires it on a goal with a category. */
  readonly typedOn: IsoDate | null
  readonly startDate: IsoDate | null
  readonly goalDate: IsoDate | null
}

export interface SavingsFundsInput {
  readonly asOf: IsoDate
  readonly categories: readonly { readonly id: string; readonly name: string; readonly kind: string; readonly sortOrder: number }[]
  readonly goals: readonly FundGoal[]
  /** Ledger rows; those outside the funds' categories are not read. */
  readonly entries: readonly { readonly postedOn: IsoDate; readonly amountCents: number; readonly categoryId: string }[]
}

export interface FundFigures extends FundBalance, FundProgress {
  readonly goalId: string
  readonly goalCents: Cents
  readonly plan: SavingsFundPlan
}

export interface SavingsFund {
  readonly categoryId: string
  readonly name: string
  /** Null for a fund with no goal yet. */
  readonly figures: FundFigures | null
}

export interface SavingsFunds {
  /** One per Savings-list category, in the list's order: the workbook's cards (Savings!C4 = START HERE!H7…). */
  readonly funds: readonly SavingsFund[]
  /**
   * Goals on no fund: never linked, or linked to a category since moved off
   * Savings (N52). Their typed amount is their balance; no transfer is read,
   * so nothing has moved in. Shaped as a fund's figures, so Savings draws
   * every goal's card the same way (G1).
   */
  readonly unlinked: readonly FundFigures[]
}

/** Every savings fund's figures on `asOf`: the workbook's Savings tab, one card per fund. */
export function savingsFunds(input: SavingsFundsInput): SavingsFunds {
  const onSavings = input.categories
    .filter((c) => c.kind === 'savings')
    .sort((a, b) => a.sortOrder - b.sortOrder || byName(a.name, b.name))
  const fundIds = new Set(onSavings.map((c) => c.id))
  const planFor = (g: FundGoal, balance: Cents) =>
    savingsFundPlan({ goalCents: g.goalCents, currentCents: balance, startDate: g.startDate, goalDate: g.goalDate })

  const funds = onSavings.map((c): SavingsFund => {
    const g = input.goals.find((x) => x.categoryId === c.id)
    if (g === undefined) return { categoryId: c.id, name: c.name, figures: null }
    if (g.typedOn === null) throw new RangeError(`The goal for fund ${c.id} has no day its balance was typed`)
    const kept = fundBalance({
      typedCents: g.typedCents,
      typedOn: g.typedOn,
      asOf: input.asOf,
      entries: input.entries.filter((e) => e.categoryId === c.id),
    })
    return {
      categoryId: c.id,
      name: c.name,
      figures: {
        goalId: g.id,
        goalCents: cents(g.goalCents),
        ...kept,
        ...fundProgress({ goalCents: g.goalCents, balanceCents: kept.balanceCents }),
        plan: planFor(g, kept.balanceCents),
      },
    }
  })
  const unlinked = input.goals
    .filter((g) => g.categoryId === null || !fundIds.has(g.categoryId))
    .map((g): FundFigures => ({
      goalId: g.id,
      goalCents: cents(g.goalCents),
      balanceCents: cents(g.typedCents),
      transfersCents: ZERO_CENTS,
      ...fundProgress({ goalCents: g.goalCents, balanceCents: g.typedCents }),
      plan: planFor(g, cents(g.typedCents)),
    }))
  return { funds, unlinked }
}
