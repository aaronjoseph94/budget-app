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
