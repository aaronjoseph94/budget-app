import type { Fact } from '@budget/core'
import { Sheet } from '../components/ui/sheet.js'
import type { Words } from './narration.js'
import { CoachText, figureText } from './words.js'

/**
 * "Why am I seeing this?" (plan §2.3): the engine's figures behind a card,
 * each named, and the one rule that made it a card. Every figure is the
 * digest's, formatted; nothing is worked out here. When the card's words
 * are the AI's, it says so.
 */
const LABEL: Readonly<Record<string, string>> = {
  now: 'So far this month',
  before: 'Same days last month',
  change: 'The difference',
  usual: 'Your usual month',
  before_month: 'Compared with',
  months: 'Complete months of records it rests on',
  actual: 'Spent this month',
  budget: 'Budget',
  over: 'Over budget by',
  left: 'Left to spend',
  pace: 'Month’s end at this pace',
  through: 'Latest statement ends',
  days: 'Days since then',
  count: 'Waiting in Review',
  milestone: 'Milestone passed',
  first: 'Spent in the first month',
  last: 'Spent in the last month',
  first_month: 'From',
  last_month: 'To',
}

const REASON: Readonly<Partial<Record<Fact['kind'], string>>> = {
  category_change: 'It shows because the change is bigger than this category usually moves in a month, allowing for how far into the month it is.',
  over_budget: 'It shows because spending on it is past the budget you set.',
  near_budget: 'It shows because 90% or more of its budget is used.',
  budget_pace: 'It shows because, at the pace so far, the month would end well over the budget you set.',
  stale_data: 'It shows because your latest statement ends more than 10 days ago, so the Coach may be missing charges.',
  rows_waiting: 'It shows because charges waiting in Review are not counted anywhere until you file them.',
  category_trend:
    'It shows because it moved the same way in most of the last few whole months, and further than it usually swings. See Reports, Trends.',
  saved_more: 'It shows because more has gone into your savings than by this day last month.',
  goal_milestone:
    'It shows because your savings passed a milestone since last week began: every 5 hours for a goal with a cost an hour, or every tenth of the target.',
  month_forecast:
    'It shows every day: where the month is heading at your pace, from what has happened, your planned bills, pay still due and savings still planned. See Help, How the forecast works.',
  price_rise:
    'It shows because this shop charges you regularly, and its latest charge is at least 50 cents and 2% more than the one before. See Reports, Shops.',
  new_subscription:
    'It shows because this shop has charged you a steady amount at regular gaps since a day in the last 100 days. If it is not a subscription, say so on Reports, Shops.',
  large_charge: 'It shows because this charge is $50.00 or more, and at least three times a usual charge in its category over the 90 days before.',
  new_shop: 'It shows because it is $100.00 or more, and the first charge from this shop in your records.',
  possible_double:
    'It shows because the same shop charged the same amount within 3 days. Nothing was removed or left out: if one was a mistake, ask the shop for a refund.',
  counted_twice:
    'It shows because a charge you added and one from your statement are the same amount within 3 days, so one purchase may be counted twice. Nothing was removed.',
}

/** The detectors' figures (F38, F39), whose slot names mean their own things. */
const SHOP_LABEL: Readonly<Record<string, string>> = {
  before: 'The charge before',
  now: 'The latest charge',
  change: 'The difference',
  next: 'Next charge expected',
  year: 'A year of it',
  price: 'Each charge',
  first: 'First charge',
  amount: 'The charge',
  date: 'Charged on',
  usual: 'A usual charge in its category',
}
const PAIR_LABEL: Readonly<Record<string, string>> = {
  amount: 'Each charge',
  first: 'The first',
  second: 'The second',
  added: 'You added it on',
  statement: 'On your statement',
}
const SHOP_KINDS: ReadonlySet<Fact['kind']> = new Set(['price_rise', 'new_subscription', 'large_charge', 'new_shop'])

/** The forecast's figures (F30 to F32), whose slot names mean their own things. */
const FORECAST_LABEL: Readonly<Record<string, string>> = {
  month: 'Month',
  spent: 'Spent by the month’s end, most likely',
  end: 'Month’s end, most likely',
  low: 'Month’s end, lowest',
  high: 'Month’s end, highest',
  safe_day: 'Safe to spend a day',
  days: 'Days left, today included',
  tightest_day: 'Tightest day in the next 30',
  tightest: 'Balance on the tightest day',
}

/** A figure's name; the same slot means another thing on a pace or a savings fact. */
function labelOf(fact: Fact, slot: string): string {
  if (fact.kind === 'month_forecast') return FORECAST_LABEL[slot] ?? slot
  if (fact.kind === 'possible_double' || fact.kind === 'counted_twice') return PAIR_LABEL[slot] ?? slot
  if (SHOP_KINDS.has(fact.kind)) return SHOP_LABEL[slot] ?? slot
  if (fact.kind === 'budget_pace' && slot === 'over') return 'Over budget at this pace by'
  if (fact.kind === 'saved_more' && slot === 'now') return 'Saved so far this month'
  if (fact.kind === 'category_trend' && slot === 'change') return 'From the first month to the last'
  return LABEL[slot] ?? slot
}

export function WhySheet({ fact, title, onClose }: { fact: Fact; title: Words; onClose: () => void }) {
  return (
    <Sheet title="Why am I seeing this?" subtitle={<CoachText text={title.text} facts={title.names} />} onClose={onClose}>
      <div className="space-y-4 p-4 text-sm">
        <dl className="divide-y">
          {Object.entries(fact.figures).map(([slot, figure]) => (
            <div key={slot} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="min-w-0 text-muted-foreground">{labelOf(fact, slot)}</dt>
              <dd className="tnum whitespace-nowrap font-medium">{figureText(figure)}</dd>
            </div>
          ))}
        </dl>
        {REASON[fact.kind] === undefined ? null : <p>{REASON[fact.kind]}</p>}
        <p className="text-muted-foreground">
          {title.ai
            ? 'The figures are worked out by the app from your own records. ✨ The words were written by AI from your numbers; it is never sent an amount.'
            : 'Worked out by the app from your own records. No AI was used.'}
        </p>
      </div>
    </Sheet>
  )
}
