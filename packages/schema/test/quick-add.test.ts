import { describe, expect, it } from 'vitest'
import { amountIsTyped, parseQuickAddReply, type QuickAddBrief } from '../src/index.js'

/**
 * Just type it's answer as a model writes it (plan A22; ADR 0005 §7): a
 * field counts only when it was asked for, and an amount only when it is
 * one of the owner's own words. Shop names are invented.
 */
const BRIEF: QuickAddBrief = {
  text: '3 coffees 12 at Litware',
  today: '2026-09-27',
  missing: ['amount', 'category', 'date'],
  categories: [
    { alias: 'c1', name: 'Groceries', list: 'variable' },
    { alias: 'c2', name: 'Coffee', list: 'variable' },
  ],
}
const none = { amount: null, date: null, shop: null, alias: null, flow: null }

describe('parseQuickAddReply keeps what was asked for', () => {
  it('keeps an amount the owner typed, a category offered and a day, from text or an object', () => {
    const reply = { amount: '12', category: 'c2', date: '2026-09-26' }
    const kept = { ok: true, pick: { ...none, amount: '12', alias: 'c2', date: '2026-09-26' }, dropped: 0 }
    expect(parseQuickAddReply(JSON.stringify(reply), BRIEF)).toEqual(kept)
    expect(parseQuickAddReply(reply, BRIEF)).toEqual(kept)
  })

  it('takes a dollar sign or a space off the amount, as the owner’s word is compared', () => {
    expect(parseQuickAddReply({ amount: '$ 12' }, BRIEF)).toMatchObject({ pick: { amount: '12' }, dropped: 0 })
  })

  it('refuses nothing it was not given, and a blank as not given', () => {
    expect(parseQuickAddReply({ amount: null, category: '  ' }, BRIEF)).toEqual({ ok: true, pick: none, dropped: 0 })
  })
})

describe('parseQuickAddReply drops a field that is not the owner’s', () => {
  it('drops an amount not in the text, one worded differently, and one that is only part of a word', () => {
    for (const amount of ['15', '12.00', '36', '1', 'twelve']) {
      expect(parseQuickAddReply({ amount }, BRIEF)).toEqual({ ok: true, pick: none, dropped: 1 })
    }
  })

  it('drops a field the parser had already filled, whatever it says', () => {
    expect(parseQuickAddReply({ shop: 'Litware', flow: 'received' }, BRIEF)).toEqual({ ok: true, pick: none, dropped: 2 })
  })

  it('drops a category not offered, or written by name', () => {
    expect(parseQuickAddReply({ category: 'c9' }, BRIEF)).toMatchObject({ pick: { alias: null }, dropped: 1 })
    expect(parseQuickAddReply({ category: 'Coffee' }, BRIEF)).toMatchObject({ pick: { alias: null }, dropped: 1 })
  })

  it('drops a day after today, before last year, or not a day at all', () => {
    for (const date of ['2026-09-28', '2024-12-31', '2026-02-30', 'yesterday']) {
      expect(parseQuickAddReply({ date }, BRIEF)).toMatchObject({ pick: { date: null }, dropped: 1 })
    }
    expect(parseQuickAddReply({ date: '2025-01-01' }, BRIEF)).toMatchObject({ pick: { date: '2025-01-01' }, dropped: 0 })
  })

  it('keeps a shop only when it is in the owner’s words, and a way only as spent or received', () => {
    const brief: QuickAddBrief = { ...BRIEF, missing: ['shop', 'flow'] }
    expect(parseQuickAddReply({ shop: 'litware', flow: 'received' }, brief)).toMatchObject({ pick: { shop: 'litware', flow: 'received' }, dropped: 0 })
    expect(parseQuickAddReply({ shop: 'Litware Coffee Roasters', flow: 'both' }, brief)).toEqual({ ok: true, pick: none, dropped: 2 })
  })

  it('refuses a reply that is not the shape asked for', () => {
    expect(parseQuickAddReply('not json', BRIEF)).toEqual({ ok: false })
    expect(parseQuickAddReply({ amount: 12 }, BRIEF)).toEqual({ ok: false })
    expect(parseQuickAddReply(['12'], BRIEF)).toEqual({ ok: false })
  })
})

describe('amountIsTyped', () => {
  it('compares after NFKC, so a full-width amount typed matches its plain form', () => {
    expect(amountIsTyped('12', 'coffee ＄１２')).toBe(true)
  })

  it('never counts a word with no digit as an amount', () => {
    expect(amountIsTyped('$', 'coffee $ 12')).toBe(false)
  })
})
