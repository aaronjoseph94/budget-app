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
 * of "is": the name follows a colon instead.
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

export type CardTemplateKey = 'stale_data' | 'rows_waiting' | 'change_down' | WatchKey
export type WatchKey = 'change_up' | 'over_budget' | 'near_budget' | 'budget_pace'

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
    case 'month_so_far':
    case 'week_so_far':
    // Worded as cards once their templates are written, in the next change.
    case 'saved_more':
    case 'goal_milestone':
      return null
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
