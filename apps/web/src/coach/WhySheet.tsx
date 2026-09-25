import type { Fact } from '@budget/core'
import { Sheet } from '../components/ui/sheet.js'
import { CoachText, figureText } from './words.js'

/**
 * "Why am I seeing this?" (plan §2.3): the engine's figures behind a card,
 * each named, and the one rule that made it a card. Every figure is the
 * digest's, formatted; nothing is worked out here.
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
}

const REASON: Readonly<Partial<Record<Fact['kind'], string>>> = {
  category_change: 'It shows because the change is bigger than this category usually moves in a month, allowing for how far into the month it is.',
  over_budget: 'It shows because spending on it is past the budget you set.',
  near_budget: 'It shows because 90% or more of its budget is used.',
  budget_pace: 'It shows because, at the pace so far, the month would end well over the budget you set.',
  stale_data: 'It shows because your latest statement ends more than 10 days ago, so the Coach may be missing charges.',
  rows_waiting: 'It shows because charges waiting in Review are not counted anywhere until you file them.',
  saved_more: 'It shows because more has gone into your savings than by this day last month.',
  goal_milestone:
    'It shows because your savings passed a milestone since last week began: every 5 hours for a goal with a cost an hour, or every tenth of the target.',
}

/** A figure's name; the same slot means another thing on a pace or a savings fact. */
function labelOf(fact: Fact, slot: string): string {
  if (fact.kind === 'budget_pace' && slot === 'over') return 'Over budget at this pace by'
  if (fact.kind === 'saved_more' && slot === 'now') return 'Saved so far this month'
  return LABEL[slot] ?? slot
}

export function WhySheet({ fact, title, onClose }: { fact: Fact; title: string; onClose: () => void }) {
  return (
    <Sheet title="Why am I seeing this?" subtitle={<CoachText text={title} facts={{ A: fact }} />} onClose={onClose}>
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
        <p className="text-muted-foreground">Worked out by the app from your own records. No AI was used.</p>
      </div>
    </Sheet>
  )
}
