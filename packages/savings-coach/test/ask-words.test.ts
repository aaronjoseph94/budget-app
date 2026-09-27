import { describe, expect, it } from 'vitest'
import { answerQuery, isoDate, type AnswerLine, type AnswerQueryInput, type AskIntent } from '@budget/core'
import { proseProblem } from '@budget/schema'
import { ANSWER_WORDS, renderSegments } from '../src/index.js'

/**
 * Ask's answers in the app's own words (plan A24): each passes the very
 * text rule a model's words must (ADR 0005 §4), and each names only the
 * figures core's answerQuery gives the line it says.
 */
const d = isoDate
const row = (postedOn: string, cents: number, categoryId: string, shop = '') => ({ id: `${postedOn}-${categoryId}-${cents}`, postedOn: d(postedOn), amountCents: cents, categoryId, shop, by: 'statement' as const })

/** Invented records: Thursday 24 September 2026, from 1 May. */
const INPUT: AnswerQueryInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-05-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: 'pay', name: 'Paycheck', kind: 'income', sortOrder: 1, weeklyBudgetCents: null },
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 2, weeklyBudgetCents: null },
    { id: 'music', name: 'Music', kind: 'subscription', sortOrder: 3, weeklyBudgetCents: null },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 4, weeklyBudgetCents: 2_000 },
  ],
  budgetHistory: [{ categoryId: 'dining', month: d('2026-05-01'), applies: 'onward', budgetCents: 5_000 }],
  planHistory: [],
  entries: [
    ...['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10'].map((day) => row(day, -1_299, 'music', 'STREAMCO')),
    ...['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15'].flatMap((day) => [row(day, -40_000, 'fund'), row(day, -6_000, 'dining', 'BISTRO'), row(day, 300_000, 'pay')]),
    row('2026-09-02', -9_000, 'dining', 'BISTRO'),
  ],
  query: { intent: 'spend_in', period: null, categoryIds: [], monthlyCents: null },
  forecast: { paySchedules: [], startingBalanceCents: 200_000 },
  goals: [{ name: 'Flight training', targetCents: 3_000_000, savedCents: 160_000, targetDate: null, fundCategoryId: 'fund', unitCostCents: 27_500 }],
  debts: { debts: [{ name: 'Car loan', startMonth: d('2026-01-01'), startingBalanceCents: 120_000, minimumPaymentCents: 10_000, aprBasisPoints: 0 }], extraPayments: [] },
  notSubscriptions: [],
}

const INTENTS: readonly AskIntent[] = [
  'spend_in', 'compare', 'top_categories', 'top_shops', 'subscriptions', 'forecast', 'safe_to_spend', 'goal_date', 'what_if_cut', 'debt_free', 'explain_month', 'budget_left',
]

/** Every line answerQuery gives, for each intent, with and without a category. */
function lines(): AnswerLine[] {
  return INTENTS.flatMap((intent) =>
    [[], ['dining'], ['pay']].flatMap((categoryIds) => {
      const answer = answerQuery({ ...INPUT, query: { intent, period: null, categoryIds, monthlyCents: intent === 'what_if_cut' ? 5_000 : null } })
      return answer.status === 'answered' ? [answer.main, ...answer.rows] : []
    }),
  )
}

describe('ANSWER_WORDS', () => {
  it('holds every sentence to the text rule a model’s words are held to', () => {
    for (const [say, words] of Object.entries(ANSWER_WORDS)) expect([say, proseProblem(words.text, 240)]).toEqual([say, null])
  })

  it('names only the main line’s figures, and only the name of a line under it', () => {
    for (const [say, words] of Object.entries(ANSWER_WORDS)) {
      const blanks = [...words.text.matchAll(/\{\{([A-Z]+)\.([a-z_]+)\}\}/g)].map((m) => `${m[1]}.${m[2]}`)
      expect([say, blanks.filter((b) => !b.startsWith('A.') && b !== 'B.name')]).toEqual([say, []])
      if (words.lead !== null) expect(blanks, say).toContain(`A.${words.lead}`)
    }
  })

  it('draws every line core gives with the figures it has', () => {
    const drawn = lines()
    // The scenario reaches most of the sentences, so the check is not a vacuous one.
    expect(new Set(drawn.map((l) => l.say)).size).toBeGreaterThanOrEqual(14)
    for (const line of drawn) {
      const read = renderSegments({ text: ANSWER_WORDS[line.say].text, slots: { A: ['name', ...Object.keys(line.figures)], B: ['name'] } })
      expect([line.say, read.ok]).toEqual([line.say, true])
    }
  })
})
