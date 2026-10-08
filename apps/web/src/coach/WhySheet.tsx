import type { Fact } from '@budget/core'
import { Sheet } from '../components/ui/sheet.js'
import type { Words } from './narration.js'
import { CoachText, figureText } from './words.js'

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
  category_change: 'It shows because this category moved more than it usually does by this point in a month.',
  over_budget: 'It shows because spending on it is past the budget you set.',
  near_budget: 'It shows because 90% or more of its budget is used.',
  budget_pace: 'It shows because, at the pace so far, the month would end well over the budget you set.',
  stale_data: 'It shows because your latest statement ends over 10 days ago. The Coach may be missing charges.',
  rows_waiting: 'It shows because charges waiting in Review are not counted anywhere until you file them.',
  category_trend: 'It shows because it moved the same way in most recent whole months, past its usual swing. See Reports, Trends.',
  saved_more: 'It shows because more has gone into your savings than by this day last month.',
  goal_milestone:
    'It shows because your savings passed a milestone since last week began. That is every 5 hours for a goal with a cost an hour, or every tenth of the target.',
  month_forecast:
    'It shows every day: where the month is heading at your pace. It counts what has happened, planned bills, pay still due and savings still planned. See Help, Coach, Ask and the forecast.',
  price_rise:
    'It shows because this shop charges you regularly and its latest charge rose. A rise is at least 50 cents and 2% over the one before. See Reports, Shops.',
  new_subscription:
    'It shows because this shop charges a steady amount at regular gaps, all within 100 days. If it is not a subscription, say so on Reports, Shops.',
  large_charge: 'It shows because this charge is $50.00 or more. It is at least three times a usual charge in its category over the 90 days before.',
  new_shop: 'It shows because it is $100.00 or more, and this shop’s first charge in your records.',
  possible_double:
    'It shows because the same shop charged the same amount within 3 days. Nothing was removed or left out: if one was a mistake, ask the shop for a refund.',
  counted_twice:
    'It shows because a charge you added matches one from your statement within 3 days. One purchase may be counted twice. Nothing was removed.',
  spending_streak:
    'It shows because the Week’s Left to spend held at $0.00 or more for 2 whole weeks or more. See Reports, Habits.',
  personal_best:
    'It shows because its last whole month was its lowest by $1.00 or more. It is set against up to 12 whole months, 3 at least. See Reports, Habits.',
}

/** The habits' wins (F40), whose slot names mean their own things. */
const HABIT_LABEL: Readonly<Record<string, string>> = {
  weeks: 'Whole weeks in a row within budget',
  best: 'Your longest run, in weeks',
  left: 'Left to spend in the last whole week',
  week: 'The last whole week began',
  now: 'Spent in its lowest month',
  before: 'Its next lowest month',
  change: 'The difference',
  month: 'Its lowest month',
  before_month: 'The next lowest was in',
  months: 'Whole months it rests on',
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
  if (fact.kind === 'spending_streak' || fact.kind === 'personal_best') return HABIT_LABEL[slot] ?? slot
  if (fact.kind === 'budget_pace' && slot === 'over') return 'Over budget at this pace by'
  if (fact.kind === 'saved_more' && slot === 'now') return 'Saved so far this month'
  if (fact.kind === 'category_trend' && slot === 'change') return 'From the first month to the last'
  return LABEL[slot] ?? slot
}

/**
 * "Why am I seeing this?" (plan §2.3): the engine's figures behind a card,
 * each named, and the one rule that made it a card. Every figure is the
 * digest's, formatted; nothing is worked out here. When the card's words
 * are the AI's, it says so.
 */
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
