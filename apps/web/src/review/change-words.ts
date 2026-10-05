/**
 * A suggested change in the owner's words (ADR 0013, PROPOSALS.md §2's
 * last column): what it changes, from what to what, and what the owner
 * would feel. Money only through the one display helper, months and days
 * through format.ts; names, shops and new names are data, kept apart so
 * the card draws each as IngestedText. No difference, total or percentage
 * is worked out for a card. Pure.
 */
import type { StoredSuggestion } from '@budget/schema'
import { formatCents, formatIsoDate, formatMonthTitle } from '../format.js'
import { LIST_HEADING, type CategoryKind } from '../lists.js'
import { plannedStanding, type Sources } from './suggested-changes.js'

/** Words to draw: plain text, or data (a name, a shop) drawn as ingested text. */
export type Words = readonly (string | { readonly data: string })[]

export interface CardWords {
  /** What it changes. */
  readonly title: Words
  /** The two values, or null for a kind with none (adding a category). */
  readonly change: { readonly from: Words; readonly to: Words } | null
  /** What the owner would feel, beyond the from and to. */
  readonly note: string | null
}

type Value = Readonly<Record<string, unknown>>

const GONE = 'a removed category'
const categoryName = (sources: Sources, id: unknown): Words => {
  const found = sources.categories.find((c) => c.id === id)
  return [found === undefined ? GONE : { data: found.name }]
}
/** Income and Savings have goals where the other lists have budgets, as the Month says. */
function wordFor(sources: Sources, id: string): 'goal' | 'budget' {
  const kind = sources.categories.find((c) => c.id === id)?.kind
  return kind === 'income' || kind === 'savings' ? 'goal' : 'budget'
}
const listOf = (list: unknown) => (typeof list === 'string' && Object.hasOwn(LIST_HEADING, list) ? LIST_HEADING[list as CategoryKind] : 'another list')
const money = (cents: unknown, none: string) => (typeof cents === 'number' ? formatCents(cents) : none)

/** One value of a suggestion's kind, as stored or as it is now, in words. */
export function valueWords(s: StoredSuggestion, value: Value, sources: Sources): Words {
  switch (s.kind) {
    case 'set_budget': {
      // No budget typed on Bills, Debts or Subscriptions is the monthly
      // amount standing as one, as the Month marks it "planned" (F51).
      const planned = typeof value['cents'] === 'number' ? null : plannedStanding(sources, s.target.category_id, s.target.month)
      return [planned === null ? money(value['cents'], `no ${wordFor(sources, s.target.category_id)}`) : `${formatCents(planned)} planned`]
    }
    case 'set_weekly_limit':
      return [money(value['cents'], `no ${wordFor(sources, s.target.category_id)}`)]
    case 'set_bill': {
      // As Setup says it: "no monthly amount" whether stopped or never set.
      const day = typeof value['due_day'] === 'number' ? `, paid on day ${value['due_day']}` : ''
      return [typeof value['cents'] === 'number' ? `${formatCents(value['cents'])} a month${day}` : `no monthly amount${day}`]
    }
    case 'set_goal': {
      const date = typeof value['target_date'] === 'string' ? `by ${formatIsoDate(value['target_date'])}` : 'no date'
      return [`${money(value['target_cents'], 'no target')}, ${date}`]
    }
    case 'rename_category':
      return [{ data: String(value['name']) }]
    case 'move_category':
      return [listOf(value['list'])]
    case 'add_category':
      return value['exists'] === false ? ['not there yet'] : [{ data: String(value['name']) }, ` on ${listOf(value['list'])}`]
    case 'recategorise':
      return categoryName(sources, value['category_id'])
    case 'learn_shop': {
      const rule = value['rule_category_id']
      const filed: Words = rule === undefined ? [] : rule === null ? [' (filed by hand)'] : [' (always filed under ', ...categoryName(sources, rule), ')']
      return ['under ', ...categoryName(sources, value['category_id']), ...filed]
    }
  }
}

/** A month's own "just this month" budget for a category, as Apply reads it to replace. */
const ownOnly = (sources: Sources, categoryId: string, month: string) =>
  sources.budgets.find((b) => b.category_id === categoryId && b.month === month && b.applies === 'only')

/** The charge a suggestion names, as the Month lists it: shop, day and amount. */
function chargeWords(sources: Sources, id: string): Words {
  const charge = sources.charges.find((c) => c.id === id)
  return charge === undefined ? ['a removed charge'] : [{ data: charge.merchant_raw }, `, ${formatIsoDate(charge.posted_on)}, ${formatCents(charge.amount_cents)}`]
}

/** What a move to or from a list does that the owner would feel. */
function moveNote(s: Extract<StoredSuggestion, { kind: 'move_category' }>, sources: Sources): string | null {
  if (s.after.list === 'transfer') return 'Its charges stop counting as spending.'
  if (s.before.list === 'transfer') return 'Its charges start counting as spending.'
  if (s.before.list === 'savings' && sources.funds.some((g) => g.category_id === s.target.category_id)) return 'Its savings goal will be on no fund.'
  return null
}

/** Whether moving a charge between two categories takes it out of spending or into it, as a move to or from Not spending does. */
function spending(sources: Sources, from: string, to: string): 'stop' | 'start' | null {
  const kind = (id: string) => sources.categories.find((c) => c.id === id)?.kind
  if (kind(to) === 'transfer' && kind(from) !== 'transfer') return 'stop'
  if (kind(from) === 'transfer' && kind(to) !== 'transfer') return 'start'
  return null
}

/** A learned shop's note: it lasts, and, to or from Not spending, its charges' spending with it. */
function noteForRule(turn: 'stop' | 'start' | null): string {
  const lasting = 'From now on its statement lines skip Review. This charge moves too.'
  return turn === null ? lasting : `${lasting} It and the shop’s later charges ${turn} counting as spending.`
}

export function cardWords(s: StoredSuggestion, sources: Sources): CardWords {
  const fromTo = (from: Value, to: Value) => ({ from: valueWords(s, from, sources), to: valueWords(s, to, sources) })
  switch (s.kind) {
    case 'set_budget': {
      const word = wordFor(sources, s.target.category_id)
      const when = s.target.applies === 'onward' ? ` from ${formatMonthTitle(s.target.month)} on` : ` for ${formatMonthTitle(s.target.month)} only`
      const later = `And every later month without its own ${word}.`
      // Apply replaces the month's own "just this month" value too (D12), one
      // typed after the suggestion included: the card says so (skills-01).
      const own = s.target.applies === 'onward' ? ownOnly(sources, s.target.category_id, s.target.month) : undefined
      const replaced =
        own === undefined || own.budget_cents === s.after.cents
          ? ''
          : `${formatMonthTitle(s.target.month)} ${own.budget_cents === null ? `is set to no ${word}` : `has its own ${word} of ${formatCents(own.budget_cents)}`}, just for that month, and this replaces it. `
      const note = s.target.applies === 'onward' ? `${replaced}${later}` : null
      return { title: [...categoryName(sources, s.target.category_id), ` ${word}${when}`], change: fromTo(s.before, s.after), note }
    }
    case 'set_weekly_limit':
      return { title: [...categoryName(sources, s.target.category_id), ` weekly ${wordFor(sources, s.target.category_id)}`], change: fromTo(s.before, s.after), note: null }
    case 'set_bill':
      return { title: [...categoryName(sources, s.target.category_id), ` monthly amount from ${formatMonthTitle(s.target.month)} on`], change: fromTo(s.before, s.after), note: null }
    case 'set_goal': {
      const goal = sources.funds.find((g) => g.id === s.target.goal_id)
      return { title: [goal === undefined ? 'A removed goal' : { data: goal.name }, ' savings goal'], change: fromTo(s.before, s.after), note: null }
    }
    case 'rename_category':
      return { title: ['Rename a category'], change: fromTo(s.before, s.after), note: 'Its charges, budgets and learned shops follow.' }
    case 'add_category':
      return { title: ['Add ', { data: s.target.name }, ` to ${LIST_HEADING[s.target.list]}`], change: null, note: null }
    case 'move_category':
      return { title: ['Move ', ...categoryName(sources, s.target.category_id)], change: fromTo(s.before, s.after), note: moveNote(s, sources) }
    case 'recategorise': {
      const turn = spending(sources, s.before.category_id, s.after.category_id)
      return { title: chargeWords(sources, s.target.transaction_id), change: fromTo(s.before, s.after), note: turn === null ? null : `This charge ${turn}s counting as spending.` }
    }
    case 'learn_shop': {
      const charge = sources.charges.find((c) => c.id === s.target.transaction_id)
      const shop: Words = charge === undefined ? ['a removed charge’s shop'] : [{ data: charge.merchant_raw }]
      return {
        title: ['Always file ', ...shop, ' under ', ...categoryName(sources, s.after.category_id)],
        change: { from: valueWords(s, s.before, sources), to: ['under ', ...categoryName(sources, s.after.category_id), ' (always)'] },
        note: noteForRule(spending(sources, s.before.category_id, s.after.category_id)),
      }
    }
  }
}
