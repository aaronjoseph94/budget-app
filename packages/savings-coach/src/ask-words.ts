/**
 * Ask's answers in the app's own words (plan §2.7, A24; ADR 0005 §3, §5).
 *
 * Each sentence holds blanks, never a figure: `{{A.amount}}` is the answer's
 * main line's figure named amount, `{{A.name}}` whom it is about, and
 * `{{B.name}}` the first line under it. The app fills each blank from
 * core's answerQuery as it draws. The words are the app's, for every answer:
 * the AI only read the question, was sent no figure, and so cannot know
 * whether a figure is good news, so it writes nothing here. A change is
 * drawn with the engine's direction word ("$1.00 more").
 *
 * Every sentence is held to ModelProse by its test, as the Coach's are.
 */
import type { AnswerSay } from '@budget/core'

export interface AnswerWords {
  readonly text: string
  /** The figure shown large above the sentence, by slot; null for an answer with none. */
  readonly lead: string | null
}

const w = (text: string, lead: string | null = null): AnswerWords => ({ text, lead })

export const ANSWER_WORDS: Readonly<Record<AnswerSay, AnswerWords>> = {
  spent_in: w('You spent {{A.amount}} on {{A.name}}.', 'amount'),
  received_in: w('{{A.name}} brought in {{A.amount}}.', 'amount'),
  saved_in: w('You put {{A.amount}} into {{A.name}}.', 'amount'),
  spent_all: w('You spent {{A.amount}} in all.', 'amount'),
  compared: w('{{A.name}}: {{A.change}} than the days before, {{A.now}} against {{A.before}}.', 'change'),
  compared_all: w('You spent {{A.change}} than the days before, {{A.now}} against {{A.before}}.', 'change'),
  compared_same: w('{{A.name}}: {{A.change}} as the days before, {{A.now}} against {{A.before}}.', 'change'),
  compared_all_same: w('You spent {{A.change}} as the days before, {{A.now}} against {{A.before}}.', 'change'),
  not_compared: w('{{A.name}} came to {{A.amount}}. Your records don’t reach back far enough to compare it with the time before.', 'amount'),
  top_categories: w('{{A.name}} came first, at {{A.amount}}.', 'amount'),
  top_shops: w('You spent the most at {{A.name}}: {{A.amount}}.', 'amount'),
  nothing_spent: w('Nothing was spent in those days.'),
  no_shops: w('No charges at a shop in those days.'),
  row: w('{{A.name}}: {{A.amount}}', 'amount'),
  month: w('In {{A.month}}, {{A.income}} came in, you spent {{A.spent}} and saved {{A.saved}}.', 'spent'),
  left: w('{{A.name}} has {{A.left}} left.', 'left'),
  over: w('{{A.name}} is {{A.over}} over its budget. One thing to try: skip one treat this week.', 'over'),
  no_budget: w('{{A.name}} has no budget yet. Set one on the Month or the Week to see what is left.'),
  left_all: w('You have {{A.left}} left to spend on everyday things.', 'left'),
  over_all: w('Everyday spending is {{A.over}} over budget. One thing to try: a no-spend day this week.', 'over'),
  subscriptions: w('Regular charges found: {{A.count}}, costing {{A.year}} a year together.', 'year'),
  subscription: w('{{A.name}}: {{A.price}} each time, {{A.year}} a year', 'year'),
  no_subscriptions: w('No regular charges found yet. A charge needs to come a few times, at steady gaps, to count.'),
  forecast_range: w('This month should end between {{A.low}} and {{A.high}}, most likely near {{A.mid}}.', 'mid'),
  forecast_rough: w('This month should end near {{A.mid}}. That is rough for now: there is little history yet.', 'mid'),
  too_early: w('Too early to tell. Check back on {{A.date}}.'),
  no_start: w('Type this month’s starting balance on the Month, and this can be worked out.'),
  safe: w('You can spend {{A.per_day}} a day until the month ends, today included.', 'per_day'),
  nothing_left: w('Nothing is left to spend safely this month, once your bills and savings are counted.'),
  goal_range: w('{{A.name}}: most likely {{A.middle}}, somewhere from {{A.early}} to {{A.late}}.', 'middle'),
  goal_range_open: w('{{A.name}}: most likely {{A.middle}}, perhaps as soon as {{A.early}}.', 'middle'),
  goal_rough: w('{{A.name}}: about {{A.middle}} at your pace. That is rough for now.', 'middle'),
  goal_met: w('{{A.name}} is reached. Well done!'),
  goal_no_fund: w('{{A.name}} has no date yet: make it a fund on Savings, and what you move in sets the pace.'),
  goal_no_pace: w('{{A.name}} has no date at your current pace. Moving a little in each payday starts one.'),
  goal_too_early: w('{{A.name}} will have a date once a whole month is in. Check back on {{A.date}}.'),
  goal_no_records: w('{{A.name}} will have a date once your records are in.'),
  no_goals: w('You have no active savings goal yet. Add one on Savings.'),
  what_if_sooner: w('Saving {{A.monthly}} a month gets you to {{B.name}} around {{A.middle}}, instead of {{A.was}}.', 'monthly'),
  what_if_alone: w('Saving {{A.monthly}} a month on its own gets you to {{B.name}} around {{A.date}}.', 'monthly'),
  what_if_met: w('{{B.name}} is already reached. Well done!'),
  no_saving: w('There is no saving to suggest for that yet. Ask again with an amount a month.'),
  goal: w('{{A.name}}'),
  debt_free: w('Debt-free by {{A.month}} on your payoff plan.', 'month'),
  no_debts: w('No debts on your payoff plan.'),
  never_paid_off: w('Not until every minimum payment covers its interest. See which one on Debts.'),
}
