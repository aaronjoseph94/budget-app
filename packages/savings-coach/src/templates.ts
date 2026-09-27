/**
 * The Coach in the app's own words (plan §2.3, ADR 0005 §4, §9).
 *
 * One template per kind of fact, in each tone: Cheerleader, the default,
 * leads with the win and never shames; Straight talker says it plainly.
 * Every figure is a blank the app fills from the engine, `{{A.change}}`, so
 * these words hold no digit and pass the same text rule a model's must. A
 * card that says to watch something always carries one thing to try: a
 * bare "you overspent" helps nobody. A category's name is the owner's own
 * text and may be plural ("Groceries"), so no title makes it the subject
 * of "is": the name follows a colon instead. A shop's name is the
 * statement's, in capitals, and follows a colon too.
 */
import type { Fact } from '@budget/core'

export type Tone = 'cheerleader' | 'straight'
export const TONES: readonly Tone[] = ['cheerleader', 'straight']

export interface Template {
  readonly title: string
  readonly body: string
}

/** A card that asks the owner to watch something, with the one thing to try. */
export interface WatchTemplate extends Template {
  readonly tryThis: string
}

export type CardTemplateKey =
  | 'stale_data'
  | 'rows_waiting'
  | 'change_down'
  | 'trend_down'
  | 'saved_more'
  | 'goal_milestone'
  | 'spending_streak'
  | 'personal_best'
  | 'forecast'
  | 'forecast_spent'
  | WatchKey
export type WatchKey = 'change_up' | 'trend_up' | 'over_budget' | 'near_budget' | 'budget_pace' | 'forecast_watch' | ShopKey
/** Digest version 2's detectors (F38, F39): each is a card to watch, named by its fact's kind. */
export type ShopKey = 'price_rise' | 'new_subscription' | 'large_charge' | 'new_shop' | 'possible_double' | 'counted_twice'

type Tones<T> = Readonly<Record<Tone, T>>

export const WATCH_TEMPLATES: Readonly<Record<WatchKey, Tones<WatchTemplate>>> = {
  change_up: {
    cheerleader: {
      title: 'Running ahead: {{A.name}}',
      body: 'You’ve spent {{A.change}} on {{A.name}} than by this day in {{A.before_month}}.',
      tryThis: 'One thing to try: give it a lighter week, and the month evens out.',
    },
    straight: {
      title: 'Up on last month: {{A.name}}',
      body: '{{A.name}}: {{A.change}} than by this day in {{A.before_month}}.',
      tryThis: 'Try this: set a weekly limit for it and check it on Sunday.',
    },
  },
  over_budget: {
    cheerleader: {
      title: 'Past the budget: {{A.name}}',
      body: '{{A.actual}} spent against a budget of {{A.budget}}, so {{A.over}} over.',
      tryThis: 'One thing to try: pause it for the rest of the month, or raise the budget if it was set too low.',
    },
    straight: {
      title: 'Over budget: {{A.name}}',
      body: '{{A.over}} over its budget of {{A.budget}}.',
      tryThis: 'Try this: stop spending on it until the month ends, or set a budget you can keep.',
    },
  },
  near_budget: {
    cheerleader: {
      title: 'Budget nearly used: {{A.name}}',
      body: '{{A.left}} left of {{A.budget}} for {{A.name}} this month.',
      tryThis: 'One thing to try: decide what the rest is for before you spend it.',
    },
    straight: {
      title: 'Almost at budget: {{A.name}}',
      body: '{{A.left}} left of {{A.budget}}.',
      tryThis: 'Try this: plan the rest of the month’s spending on it now.',
    },
  },
  budget_pace: {
    cheerleader: {
      title: 'Heading over budget: {{A.name}}',
      body: 'At this pace, the month ends with {{A.name}} near {{A.pace}}, over its budget of {{A.budget}}.',
      tryThis: 'One thing to try: a few lighter days now keeps it under.',
    },
    straight: {
      title: 'On pace to go over: {{A.name}}',
      body: 'Heading for {{A.pace}} against a budget of {{A.budget}}.',
      tryThis: 'Try this: cut back on it for the next week.',
    },
  },
  // Rising steadily over the last months (F37): a habit, not one dear month.
  trend_up: {
    cheerleader: {
      title: 'Creeping up: {{A.name}}',
      body: 'Month by month, {{A.name}} went from {{A.first}} in {{A.first_month}} to {{A.last}} in {{A.last_month}}.',
      tryThis: 'One thing to try: aim for {{A.usual}}, your usual month, and it stops creeping.',
    },
    straight: {
      title: 'Rising steadily: {{A.name}}',
      body: '{{A.name}}: up from {{A.first}} in {{A.first_month}} to {{A.last}} in {{A.last_month}}.',
      tryThis: 'Try this: set a budget of {{A.usual}} a month for it and check it on Sunday.',
    },
  },
  // The month would end below $0, or a day would run short (F30 to F32).
  forecast_watch: {
    cheerleader: {
      title: 'A tight finish ahead',
      body: 'At this pace, {{A.month}} ends near {{A.end}}, and money is tightest on {{A.tightest_day}}.',
      tryThis: 'One thing to try: hold off on what can wait until after payday.',
    },
    straight: {
      title: 'Heading for a shortfall',
      body: 'At this pace, {{A.month}} ends near {{A.end}}. The tightest day is {{A.tightest_day}}, at {{A.tightest}}.',
      tryThis: 'Try this: keep to {{A.safe_day}} a day until payday.',
    },
  },
  // A subscription's latest charge is dearer than the one before (F38).
  price_rise: {
    cheerleader: {
      title: 'A price went up: {{A.name}}',
      body: 'It now charges {{A.now}}, up from {{A.before}}. That comes to {{A.year}} a year.',
      tryThis: 'One thing to try: check it is still worth it to you, or look for a cheaper plan.',
    },
    straight: {
      title: 'Price rise: {{A.name}}',
      body: '{{A.before}} before, {{A.now}} now: {{A.year}} a year.',
      tryThis: 'Try this: cancel it if you would not sign up again at this price.',
    },
  },
  new_subscription: {
    cheerleader: {
      title: 'A new regular charge: {{A.name}}',
      body: 'It has charged you {{A.price}} regularly since {{A.first}}, about {{A.year}} a year. The next one looks due around {{A.next}}.',
      tryThis: 'One thing to try: if you meant to sign up, plan for it as a bill; if not, cancel it before {{A.next}}.',
    },
    straight: {
      title: 'New subscription: {{A.name}}',
      body: '{{A.price}} each time since {{A.first}}: {{A.year}} a year.',
      tryThis: 'Try this: cancel it before {{A.next}} unless you mean to keep it.',
    },
  },
  // Far above its category's usual charge (F39).
  large_charge: {
    cheerleader: {
      title: 'A bigger charge than usual: {{A.name}}',
      body: '{{A.amount}} on {{A.date}}. A usual charge in that category is about {{A.usual}}.',
      tryThis: 'One thing to try: if it was planned, all is well; if not, check it on your statement.',
    },
    straight: {
      title: 'Large charge: {{A.name}}',
      body: '{{A.amount}} on {{A.date}}, against a usual {{A.usual}} in its category.',
      tryThis: 'Try this: make sure you recognise it.',
    },
  },
  new_shop: {
    cheerleader: {
      title: 'A new place: {{A.name}}',
      body: '{{A.amount}} on {{A.date}}, the first charge from it in your records.',
      tryThis: 'One thing to try: if you don’t recognise it, ask your card company about it.',
    },
    straight: {
      title: 'First charge from a new shop: {{A.name}}',
      body: '{{A.amount}} on {{A.date}}.',
      tryThis: 'Try this: check you recognise it.',
    },
  },
  // "Double" and "twice" are number words, which no card may hold (ADR 0005).
  possible_double: {
    cheerleader: {
      title: 'Charged again? {{A.name}}',
      body: 'The same charge of {{A.amount}} came on {{A.first}} and again on {{A.second}}.',
      tryThis: 'One thing to try: check your statement, and ask the shop for a refund if one was a mistake.',
    },
    straight: {
      title: 'Possible repeat charge: {{A.name}}',
      body: '{{A.amount}} on {{A.first}}, and the same again on {{A.second}}.',
      tryThis: 'Try this: ask the shop to refund one if it was charged in error.',
    },
  },
  counted_twice: {
    cheerleader: {
      title: 'Counted more than once? {{A.name}}',
      body: 'A charge of {{A.amount}} you added yourself on {{A.added}} looks like one from your statement on {{A.statement}}.',
      tryThis: 'One thing to try: if they are the same purchase, remove the one you added in All transactions.',
    },
    straight: {
      title: 'Added and imported: {{A.name}}',
      body: '{{A.amount}} you added on {{A.added}}, and the same from your statement on {{A.statement}}.',
      tryThis: 'Try this: remove the one you added in All transactions if they are one purchase.',
    },
  },
}

export const PLAIN_TEMPLATES: Readonly<Record<Exclude<CardTemplateKey, WatchKey>, Tones<Template>>> = {
  stale_data: {
    cheerleader: {
      title: 'Time for a fresh statement',
      body: 'Your last statement ends on {{A.through}}, {{A.days}} days ago. Import the new one for fresh advice.',
    },
    straight: {
      title: 'Your records are out of date',
      body: 'Your statements end on {{A.through}}. Import the new one, or this advice is out of date too.',
    },
  },
  rows_waiting: {
    cheerleader: {
      title: 'Charges waiting for you',
      body: 'Waiting in Review: {{A.count}}. Each one counts as soon as you file it.',
    },
    straight: {
      title: 'Review has charges waiting',
      body: 'Waiting in Review: {{A.count}}. None of them is counted until you file it.',
    },
  },
  change_down: {
    cheerleader: {
      title: 'Nice work on {{A.name}}',
      body: 'You’ve spent {{A.change}} on {{A.name}} than by this day in {{A.before_month}}. Keep it going!',
    },
    straight: {
      title: 'Down on last month: {{A.name}}',
      body: '{{A.name}}: {{A.change}} than by this day in {{A.before_month}}.',
    },
  },
  trend_down: {
    cheerleader: {
      title: 'Trending down: {{A.name}}',
      body: 'Month by month, you brought {{A.name}} from {{A.first}} in {{A.first_month}} to {{A.last}} in {{A.last_month}}. Lovely work!',
    },
    straight: {
      title: 'Falling steadily: {{A.name}}',
      body: '{{A.name}}: down from {{A.first}} in {{A.first_month}} to {{A.last}} in {{A.last_month}}.',
    },
  },
  saved_more: {
    cheerleader: {
      title: 'You saved more this month',
      body: 'You’ve put {{A.change}} into savings than by this day in {{A.before_month}}. Keep it up!',
    },
    straight: {
      title: 'Saved more than last month',
      body: 'Savings: {{A.change}} than by this day in {{A.before_month}}.',
    },
  },
  // Where the month is heading (F30, F31), with a start typed, and without one (D17).
  forecast: {
    cheerleader: {
      title: 'Where {{A.month}} is heading',
      body: 'At this pace, {{A.month}} ends near {{A.end}}. Safe to spend: {{A.safe_day}} a day.',
    },
    straight: {
      title: 'Forecast: {{A.month}}',
      body: 'Heading for {{A.end}} at the month’s end. Safe to spend: {{A.safe_day}} a day.',
    },
  },
  forecast_spent: {
    cheerleader: {
      title: 'Where {{A.month}} is heading',
      body: 'At this pace, you’ll spend about {{A.spent}} in {{A.month}}. Type this month’s starting balance to see where you’ll end.',
    },
    straight: {
      title: 'Forecast: {{A.month}}',
      body: 'Spending is heading for {{A.spent}}. Type this month’s starting balance to see the month’s end.',
    },
  },
  // The milestone is hours of the goal's unit, or a share of its target.
  goal_milestone: {
    cheerleader: {
      title: 'Milestone: {{A.name}}',
      body: 'You’ve now saved {{A.milestone}} toward it. Every step counts, so keep going!',
    },
    straight: {
      title: 'Milestone passed: {{A.name}}',
      body: '{{A.milestone}} saved toward it, and counting.',
    },
  },
  // Complete weeks in a row within the weekly budgets (F40).
  spending_streak: {
    cheerleader: {
      title: 'On a roll: {{A.weeks}} weeks within budget',
      body: 'Your everyday spending stayed within your weekly budgets {{A.weeks}} weeks in a row. Your longest run is {{A.best}} weeks. Keep it going!',
    },
    straight: {
      title: '{{A.weeks}} weeks within budget',
      body: 'Everyday spending: within your weekly budgets {{A.weeks}} weeks running. Longest run: {{A.best}} weeks.',
    },
  },
  // A category's last whole month was its lowest (F40).
  personal_best: {
    cheerleader: {
      title: 'Personal best: {{A.name}}',
      body: '{{A.now}} on {{A.name}} in {{A.month}}, your lowest in {{A.months}} whole months: {{A.change}} than in {{A.before_month}}. Brilliant!',
    },
    straight: {
      title: 'Lowest month yet: {{A.name}}',
      body: '{{A.name}}: {{A.now}} in {{A.month}}, {{A.change}} than your next lowest, in {{A.before_month}}.',
    },
  },
}

/** The day's line, from this month's summary or, without one, this week's. */
export type LineKey = `${'month' | 'week'}_${Fact['meaning']}`

export const LINE_TEMPLATES: Readonly<Record<LineKey, Tones<string>>> = {
  month_good: {
    cheerleader: 'You’ve spent {{A.change}} than by this day last month. Nice going!',
    straight: 'You’ve spent {{A.change}} than by this day last month.',
  },
  month_watch: {
    cheerleader: 'You’ve spent {{A.change}} than by this day last month. There’s still time to ease off.',
    straight: 'You’ve spent {{A.change}} than by this day last month. Ease off for the rest of it.',
  },
  month_info: {
    cheerleader: 'Your spending is {{A.change}} as by this day last month. Steady does it!',
    straight: 'Your spending is {{A.change}} as by this day last month.',
  },
  week_good: {
    cheerleader: 'You’ve spent {{A.change}} this week than by this day last week. Nice going!',
    straight: 'You’ve spent {{A.change}} this week than by this day last week.',
  },
  week_watch: {
    cheerleader: 'You’ve spent {{A.change}} this week than by this day last week. There’s still time to ease off.',
    straight: 'You’ve spent {{A.change}} this week than by this day last week. Ease off for the rest of it.',
  },
  week_info: {
    cheerleader: 'Your spending this week is {{A.change}} as by this day last week. Steady does it!',
    straight: 'Your spending this week is {{A.change}} as by this day last week.',
  },
}

/**
 * A line of encouragement on the goals' card, naming the main goal as
 * `{{A.name}}`: the app's own words where the AI's goal line would go
 * (plan A12). It names no figure, because the card beside it shows them.
 */
export const GOAL_LINE_TEMPLATES: Tones<string> = {
  cheerleader: 'Every lighter week brings {{A.name}} closer. Keep going!',
  straight: 'Each week you spend less moves {{A.name}} closer.',
}

/** Which card template a fact is worded by; null for a kind that is never a card. */
export function cardTemplateKey(fact: Fact): CardTemplateKey | null {
  switch (fact.kind) {
    case 'stale_data':
    case 'rows_waiting':
    case 'over_budget':
    case 'near_budget':
    case 'budget_pace':
      return fact.kind
    case 'category_change':
      return fact.direction === 'up' ? 'change_up' : 'change_down'
    case 'category_trend':
      return fact.direction === 'up' ? 'trend_up' : 'trend_down'
    case 'saved_more':
    case 'goal_milestone':
    case 'spending_streak':
    case 'personal_best':
      return fact.kind
    // Never ranked into a card (core's forecastFact is not notable): the Coach gives it its own (forecastCard).
    case 'month_forecast':
      return fact.meaning === 'watch' ? 'forecast_watch' : 'end' in fact.figures ? 'forecast' : 'forecast_spent'
    case 'month_so_far':
    case 'week_so_far':
      return null
    case 'price_rise':
    case 'new_subscription':
    case 'large_charge':
    case 'new_shop':
    case 'possible_double':
    case 'counted_twice':
      return fact.kind
  }
}

/** A card's words in a tone: its title and body, and the one thing to try when it asks to watch. */
export function cardWords(key: CardTemplateKey, tone: Tone): Template & { readonly tryThis: string | null } {
  if (key in WATCH_TEMPLATES) return WATCH_TEMPLATES[key as WatchKey][tone]
  const plain = PLAIN_TEMPLATES[key as Exclude<CardTemplateKey, WatchKey>][tone]
  return { ...plain, tryThis: null }
}

/** The slots a template may name on a fact: its figures, and its subject's name. */
export function slotsOf(fact: Fact): readonly string[] {
  return ['name', ...Object.keys(fact.figures)]
}
