/**
 * Workbook's lists, as the app names and shows them.
 *
 * A category's list (`kind`, migration 0005) decides which month block its
 * charges land in, so it is never guessed: every path that makes a category
 * says which list it goes on. The headings are Workbook's START HERE headings,
 * plus the app's own "Not spending" for money that only moves.
 */
import { endOfList } from '@budget/core'
import { CategoryKindSchema, type CategoryKind } from '@budget/schema'
import { NativeSelect } from './components/ui/form.js'

export type { CategoryKind }

/** START HERE's order: Income, Savings, the three recurring lists, Variable. */
export const LISTS: readonly CategoryKind[] = CategoryKindSchema.options

export const LIST_HEADING: Readonly<Record<CategoryKind, string>> = {
  income: 'Income',
  savings: 'Savings',
  bill: 'Bills',
  debt: 'Debts',
  subscription: 'Subscriptions',
  variable: 'Variable expenses',
  transfer: 'Not spending',
}

/**
 * What a category made in Add → Type it may be, by which way the money went.
 * Money received is never offered Variable expenses: a pay category filed
 * there would count as negative spending. Money spent is never offered Income.
 */
export const LISTS_FOR: Readonly<Record<'spent' | 'received', readonly CategoryKind[]>> = {
  spent: ['savings', 'bill', 'debt', 'subscription', 'variable', 'transfer'],
  received: ['income', 'savings', 'transfer'],
}

export interface ListGroup<T> {
  readonly kind: CategoryKind
  readonly heading: string
  readonly rows: readonly T[]
}

/**
 * Rows under their lists, in list order, keeping the order the rows came in
 * (the database sorts by position, then name). Every list, empty or not.
 */
export function groupByList<T extends { readonly kind: CategoryKind }>(rows: readonly T[]): readonly ListGroup<T>[] {
  return LISTS.map((kind) => ({ kind, heading: LIST_HEADING[kind], rows: rows.filter((r) => r.kind === kind) }))
}

/** A new category for the bottom of its list, where Workbook fills the next slot. */
export function atEndOf(
  categories: readonly { readonly kind: CategoryKind; readonly sort_order: number }[],
  name: string,
  kind: CategoryKind,
): { readonly name: string; readonly kind: CategoryKind; readonly sortOrder: number } {
  const { sortOrder } = endOfList({ sortOrders: categories.filter((c) => c.kind === kind).map((c) => c.sort_order) })
  return { name, kind, sortOrder }
}

/**
 * Workbook's example names, for Setup's "Start from Workbook's list" (plan §7).
 * They are placeholders to rename: START HERE's rows in its own order
 * (Income B8:B12, Savings H7:H10, Bills B18:B24, Debts D18:D21,
 * Subscriptions F18:F20, Variable H17:H22), plus the app's two rows a card
 * statement needs from its first import. No amount comes with them; the
 * sample's figures are the template's, not yours.
 */
const STARTER_NAMES: readonly { readonly name: string; readonly kind: CategoryKind }[] = [
  ...['Income 1', 'Income 2', 'Side Hustle', 'Freelance Work', 'Donations'].map((name) => ({ name, kind: 'income' as const })),
  ...['Emergency Fund', 'Travel Fund', 'Down Payment', 'Car Repair Fund'].map((name) => ({ name, kind: 'savings' as const })),
  ...['Rent', 'Electricity Bill', 'Water Bill', 'Gas Bill', 'Phone', 'Car Insurance', 'Gym Membership'].map((name) => ({
    name,
    kind: 'bill' as const,
  })),
  ...['Credit Card 1', 'Credit Card 2', 'Car Loan', 'Student Loan'].map((name) => ({ name, kind: 'debt' as const })),
  ...['Netflix', 'Spotify', 'Dropbox'].map((name) => ({ name, kind: 'subscription' as const })),
  // Interest is a charge, not a payment you make, so it is spending (decision 14).
  ...['Restaurants', 'Groceries', 'Clothing', 'Gas', 'Movie Theater', 'Game Night', 'Card interest & fees'].map((name) => ({
    name,
    kind: 'variable' as const,
  })),
  // Paying the card moves money; what it paid for is already counted (D9).
  { name: 'Card payments', kind: 'transfer' },
]

/**
 * The starter names, with your savings goal's name first on Savings when
 * there is one, so the goal you already track heads the list Workbook's
 * savings funds sit on.
 */
export function starterList(goalName: string | null): readonly { readonly name: string; readonly kind: CategoryKind }[] {
  return goalName === null ? STARTER_NAMES : [{ name: goalName, kind: 'savings' }, ...STARTER_NAMES]
}

/**
 * Which list a new category goes on. Shown whenever one is being made, with
 * the caller's sensible choice already picked, so the choice is always seen
 * and can always be changed. `lists` narrows what makes sense in the place
 * it is asked: money received is never offered Variable expenses.
 */
export function ListSelect({
  value,
  onChange,
  lists = LISTS,
  disabled,
}: {
  value: CategoryKind | ''
  onChange: (kind: CategoryKind | '') => void
  lists?: readonly CategoryKind[]
  disabled?: boolean
}) {
  return (
    <NativeSelect
      aria-label="Which list"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const picked = LISTS.find((kind) => kind === e.target.value)
        onChange(picked ?? '')
      }}
    >
      <option value="">Which list?</option>
      {lists.map((kind) => (
        <option key={kind} value={kind}>
          {LIST_HEADING[kind]}
        </option>
      ))}
    </NativeSelect>
  )
}

/**
 * A category picker's options, under Workbook's headings in START HERE order.
 * Lists with nothing on them are left out, so the picker shows only choices.
 */
export function CategoryOptions({
  categories,
}: {
  categories: readonly { readonly id: string; readonly name: string; readonly kind: CategoryKind }[]
}) {
  return groupByList(categories)
    .filter((group) => group.rows.length > 0)
    .map((group) => (
      <optgroup key={group.kind} label={group.heading}>
        {group.rows.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
    ))
}
