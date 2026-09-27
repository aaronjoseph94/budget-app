import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { isoDate, type Answer, type AnswerLine } from '@budget/core'
import { cents as asCents } from '@budget/money-primitives'
import type { AskRead } from '@budget/savings-coach'
import { AnswerCard } from '../src/ask/AnswerCard.js'

/** Ask's answer card (plan A24): it draws core's answer in the app's words, and formats; it never computes. */
type Read = Extract<AskRead, { kind: 'intent' }>
const SPEND: Read = { kind: 'intent', intent: 'spend_in', categoryIds: ['c-dining'], period: { kind: 'month', month: 'august', year: 'this' }, amountText: null }
const cents = (value: number) => ({ unit: 'cents' as const, value: asCents(value) })
const line = (say: AnswerLine['say'], names: string[], figures: AnswerLine['figures'] = {}): AnswerLine => ({ say, names, figures })
const answered = (main: AnswerLine, over: Partial<Extract<Answer, { status: 'answered' }>> = {}): Answer => ({
  status: 'answered',
  now: { from: isoDate('2026-08-01'), to: isoDate('2026-08-31') },
  before: null,
  cutFrom: null,
  main,
  rows: [],
  ...over,
})
const sentence = (text: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === text

function card(answer: Answer, read: Read = SPEND, names = ['Dining out'], missingUpdate = false, by: 'ai' | 'app' = 'app') {
  render(<AnswerCard read={read} by={by === 'ai' ? { by: 'ai' } : { by: 'app', why: 'chip' }} names={names} answer={answer} missingUpdate={missingUpdate} />)
}

afterEach(cleanup)

describe('AnswerCard', () => {
  it('says what it read, the figure, the sentence, the days and where to see the whole', () => {
    card(answered(line('spent_in', ['Dining out'], { amount: cents(105_400) })))
    expect(screen.getByText('I read that as: How much you spent · Dining out · August 2026')).toBeTruthy()
    expect(screen.getByText('$1,054.00', { selector: 'p' })).toBeTruthy()
    expect(screen.getByText(sentence('You spent $1,054.00 on Dining out.'))).toBeTruthy()
    expect(screen.getByText('1 – 31 Aug')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See it on the Month' }).getAttribute('href')).toBe('#/month/2026-08')
  })

  it('marks what the AI read, and names both windows of a comparison', () => {
    const compare: Read = { ...SPEND, intent: 'compare', period: { kind: 'this_month' } }
    card(
      answered(line('compared', ['Dining out'], { now: cents(84_000), before: cents(105_400), change: { unit: 'change', value: asCents(-21_400), direction: 'less' } }), {
        now: { from: isoDate('2026-09-01'), to: isoDate('2026-09-24') },
        before: { from: isoDate('2026-08-01'), to: isoDate('2026-08-24') },
      }),
      compare,
      ['Dining out'],
      false,
      'ai',
    )
    expect(screen.getByText(/I read that as: Against the time before · Dining out · This month/).textContent).toMatch(/^✨/)
    expect(screen.getByText(sentence('Dining out: $214.00 less than the days before, $840.00 against $1,054.00.'))).toBeTruthy()
    expect(screen.getByText('1 – 24 Sep, against 1 – 24 Aug')).toBeTruthy()
  })

  it('says where the records start when they start inside the days asked about', () => {
    card(answered(line('spent_in', ['Dining out'], { amount: cents(900) }), { cutFrom: isoDate('2026-08-08') }))
    expect(screen.getByText('Your records start on 8 Aug, so this counts from then.')).toBeTruthy()
  })

  it('lists the lines under the answer, and names a what-if’s goal only in its sentence', () => {
    card(
      answered(line('top_categories', ['Rent'], { amount: cents(150_000) }), { rows: [line('row', ['Rent'], { amount: cents(150_000) }), line('row', ['Dining out'], { amount: cents(84_000) })] }),
      { ...SPEND, intent: 'top_categories' },
      [],
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rent: $1,500.00', 'Dining out: $840.00'])
    expect(screen.getByRole('link', { name: 'Open Reports' }).getAttribute('href')).toBe('#/reports/2026-08')
    cleanup()

    const monthly = cents(5_000)
    card(
      answered(line('what_if_alone', [], { monthly, date: { unit: 'month_year', value: isoDate('2029-12-13') } }), { now: null, rows: [line('goal', ['Flight training'])] }),
      { ...SPEND, intent: 'what_if_cut', categoryIds: [], period: null },
      [],
    )
    expect(screen.getByText(sentence('Saving $50.00 a month on its own gets you to Flight training around December 2029.'))).toBeTruthy()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('draws a name that looks like markup as the characters it is', () => {
    card(answered(line('spent_in', ['<img src=x onerror=alert(1)>'], { amount: cents(100) })), SPEND, ['<img src=x onerror=alert(1)>'])
    expect(screen.getByText(sentence('You spent $1.00 on <img src=x onerror=alert(1)>.'))).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('says why there is no answer, in one line with the one place that helps', () => {
    card({ status: 'not_yet' })
    expect(screen.getByText('That month hasn’t come yet.')).toBeTruthy()
    cleanup()
    card({ status: 'before_records', coveredFrom: isoDate('2026-06-01') })
    expect(screen.getByText('Your records here start on 1 Jun, so there is nothing before then to count.')).toBeTruthy()
    cleanup()
    card({ status: 'before_records', coveredFrom: null })
    expect(screen.getByText('There are no records yet. Bring in a statement on Add, and ask again.')).toBeTruthy()
    cleanup()
    card({ status: 'missing', what: 'forecast' }, { ...SPEND, intent: 'safe_to_spend' }, [], true)
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    cleanup()
    card({ status: 'missing', what: 'debts' }, { ...SPEND, intent: 'debt_free' }, [], false)
    expect(screen.getByText('Your payoff plan did not load. Try again in a moment.')).toBeTruthy()
  })
})
