/**
 * `get_period`'s `compared` (PLAN §2.4): the period beside the one before
 * it, like for like, as each screen's comparison line shows it (F24, F25,
 * F26). Every figure is periodComparison's, over the same rows the period
 * was read with; this only names the categories and hands the figures out.
 */
import { periodComparison, type Change, type ComparedPeriod, type PeriodComparison } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { cleanName, money } from '../money.js'
import { categoriesFrom, entriesFrom, periodCategories, plansFrom, recordsFrom, txnsFrom, type Read } from '../rows.js'

const LISTS = ['income', 'savings', 'variable', 'bill', 'debt', 'subscription'] as const

type Wanted = { readonly list?: (typeof LISTS)[number] | undefined; readonly categories?: readonly string[] | undefined }

const changed = (c: Change) => ({
  now: money(c.nowCents),
  before: money(c.beforeCents),
  change: money(c.changeCents),
  change_bp: c.changeBp,
  direction: c.direction,
  meaning: c.meaning,
})

/** The comparison for `period`, with every category's line unless `byCategory` is false (a year gives none, §2.4). */
export function compared(read: Read, period: ComparedPeriod, today: IsoDate, wanted: Wanted, byCategory: boolean) {
  const rows = categoriesFrom(read['categories'])
  const out: PeriodComparison = periodComparison({
    ...period,
    asOf: today,
    historyStart: recordsFrom(read['records']).historyStart,
    categories: periodCategories(rows),
    planHistory: plansFrom(read['plans']),
    entries: entriesFrom(txnsFrom(read['txns'])),
  })
  if (out.status === 'not_started') return { status: out.status }
  if (out.status === 'before_records') return { status: out.status, now: out.now, before: out.before, records_start: out.historyStart }
  const names = new Map(rows.map((c) => [c.id, cleanName(c.name)]))
  const only = wanted.categories === undefined ? null : new Set(wanted.categories)
  const lists = LISTS.filter((l) => wanted.list === undefined || l === wanted.list)
  return {
    status: out.status,
    same_days: out.sameDays,
    now: out.now,
    before: out.before,
    summary: { spent: changed(out.summary.spent), income: changed(out.summary.income), saved: changed(out.summary.saved) },
    lists: lists.map((list) => ({ list, ...changed(out.blocks[list].total) })),
    categories: !byCategory
      ? []
      : lists.flatMap((list) =>
          out.blocks[list].rows
            .map((r) => ({ name: names.get(r.categoryId) ?? '', list, ...changed(r) }))
            .filter((r) => only === null || only.has(r.name)),
        ),
  }
}
