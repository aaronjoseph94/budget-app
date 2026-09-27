import { describe, expect, it } from 'vitest'
import { addDays, isoDate } from '@budget/money-primitives'
import { factsDigest, type FactsDigestInput, type ShopEntry } from '../src/index.js'
import { CATEGORIES, charges, row } from './shop-example.js'

/** Suite tests of digest version 2's detector facts, worked by hand from F38, F39 and F44 (docs/formula-decisions.md). */

const d = isoDate
const SPOTIFY = [...charges(['2026-05-14', '2026-06-14', '2026-07-14', '2026-08-14'], -11.99, 'SPOTIFY', 'music'), row('2026-09-14', -12.99, 'SPOTIFY', 'music')]
const GYM = charges(['2026-07-20', '2026-08-20', '2026-09-20'], -45, 'GYM')

const inputOf = (entries: readonly ShopEntry[], over: Partial<FactsDigestInput> = {}, notSubscriptions: readonly string[] = []): FactsDigestInput => ({
  asOf: d('2026-09-24'),
  historyStart: d('2026-02-01'),
  readFrom: d('2026-02-01'),
  categories: CATEGORIES,
  budgetHistory: [],
  planHistory: [],
  entries,
  latestStatementEnd: null,
  pendingCount: null,
  goals: [],
  shops: { entries, notSubscriptions },
  ...over,
})
const digest = (entries: readonly ShopEntry[], over: Partial<FactsDigestInput> = {}, notSubscriptions: readonly string[] = []) =>
  factsDigest(inputOf(entries, over, notSubscriptions))
const DETECTORS = ['price_rise', 'new_subscription', 'large_charge', 'new_shop', 'possible_double', 'counted_twice']
const onlyDetectors = (facts: ReturnType<typeof factsDigest>['facts']) => facts.filter((f) => DETECTORS.includes(f.kind))
const detected = (entries: readonly ShopEntry[], over: Partial<FactsDigestInput> = {}, skip: readonly string[] = []) =>
  onlyDetectors(digest(entries, over, skip).facts)
const ofKind = (entries: readonly ShopEntry[], kind: string, over: Partial<FactsDigestInput> = {}) => digest(entries, over).facts.filter((f) => f.kind === kind)

describe('factsDigest, version 2: subscriptions (F38)', () => {
  it('says a price went up, a card to watch worth its month, named by the shop', () => {
    expect(digest(SPOTIFY).version).toBe(2)
    expect(ofKind(SPOTIFY, 'price_rise')).toEqual([
      {
        key: 'shop:SPOTIFY:price_rise',
        kind: 'price_rise',
        subject: { type: 'shop', id: 'SPOTIFY', label: 'SPOTIFY' },
        direction: 'up',
        size: null,
        evidence: 'solid',
        meaning: 'watch',
        notable: true,
        figures: {
          before: { unit: 'cents', value: 1_199 },
          now: { unit: 'cents', value: 1_299 },
          change: { unit: 'change', value: 100, direction: 'more' },
          next: { unit: 'date', value: '2026-10-15' },
          year: { unit: 'cents', value: 15_588 },
        },
        // $12.99 a month, solid.
        impact: 3_897,
        cause: 'price_rise:SPOTIFY:2026-09-14',
      },
    ])
  })

  it('speaks of a rise only while its charge is in the last 30 days', () => {
    // 14 September is the 30th day back from 13 October, and not from the 14th.
    expect(ofKind(SPOTIFY, 'price_rise', { asOf: d('2026-10-13') })).toHaveLength(1)
    expect(ofKind(SPOTIFY, 'price_rise', { asOf: d('2026-10-14') })).toEqual([])
  })

  it('says a new regular charge began, with its price, next date and a year of it', () => {
    expect(ofKind(GYM, 'new_subscription')).toMatchObject([
      {
        key: 'shop:GYM:new_subscription',
        evidence: 'some',
        figures: { price: { value: 4_500 }, first: { value: '2026-07-20' }, next: { value: '2026-10-21' }, year: { value: 54_000 } },
        impact: 9_000,
        cause: 'new_subscription:GYM:2026-07-20',
      },
    ])
  })

  it('says nothing of a shop marked not a subscription', () => {
    expect(detected([...SPOTIFY, ...GYM]).map((f) => f.kind)).toEqual(['new_subscription', 'price_rise'])
    expect(detected([...SPOTIFY, ...GYM], {}, ['SPOTIFY', 'GYM'])).toEqual([])
  })
})

describe('factsDigest, version 2: unusual charges (F39)', () => {
  const usual = Array.from({ length: 12 }, (_, i) => row(addDays(d('2026-07-04'), 7 * i), -25, 'CAFE'))

  it('says a charge was large, or the first at a new shop, each by its row', () => {
    const big = row('2026-09-20', -180, 'CAFE')
    expect(ofKind([...usual, big], 'large_charge')).toMatchObject([
      {
        key: `charge:${big.id}:large`,
        subject: { type: 'shop', id: 'CAFE', label: 'CAFE' },
        evidence: 'some',
        figures: { amount: { unit: 'cents', value: 18_000 }, date: { unit: 'date', value: '2026-09-20' }, usual: { unit: 'cents', value: 2_500 } },
        impact: 36_000,
        cause: `large_charge:${big.id}`,
      },
    ])
    const sofa = row('2026-09-12', -450, 'FURNITURE CO', 'groceries')
    expect(ofKind([sofa], 'new_shop')).toMatchObject([{ figures: { amount: { value: 45_000 }, date: { value: '2026-09-12' } }, cause: `new_shop:${sofa.id}` }])
  })

  it('flags a possible double and a charge that may be counted twice, each always a card, over the last 30 days', () => {
    const [a, b] = [row('2026-09-21', -4.5, 'COFFEE HOUSE'), row('2026-09-23', -4.5, 'COFFEE HOUSE')]
    expect(ofKind([a, b], 'possible_double')).toMatchObject([
      {
        subject: { label: 'COFFEE HOUSE' },
        evidence: 'solid',
        notable: true,
        figures: { amount: { value: 450 }, first: { value: '2026-09-21' }, second: { value: '2026-09-23' } },
        cause: `possible_double:${a.id}:${b.id}`,
      },
    ])
    // Named by the statement's shop, never the owner's shorthand.
    const [typed, card] = [row('2026-09-22', -6.25, 'COFFEE', 'dining', 'hand'), row('2026-09-23', -6.25, 'COFFEE HOUSE')]
    expect(ofKind([typed, card], 'counted_twice')).toMatchObject([{ subject: { id: 'COFFEE HOUSE' }, cause: `counted_twice:${typed.id}:${card.id}` }])
    // Each date goes with its own row, whichever came first.
    const addedLater = row('2026-09-24', -6.25, 'COFFEE', 'dining', 'hand')
    expect(ofKind([card, addedLater], 'counted_twice')[0]!.figures).toEqual({
      amount: { unit: 'cents', value: 625 },
      added: { unit: 'date', value: '2026-09-24' },
      statement: { unit: 'date', value: '2026-09-23' },
    })
    // 25 August is the 31st day back.
    expect(ofKind([row('2026-08-24', -9, 'GYM'), row('2026-08-25', -9, 'GYM')], 'possible_double')).toEqual([])
    expect(ofKind([row('2026-08-25', -9, 'GYM'), row('2026-08-26', -9, 'GYM')], 'possible_double')).toHaveLength(1)
  })

  it('names a pair with no shop "A charge", and cuts a long shop to 100 characters in its cause', () => {
    const [typed, card] = [row('2026-09-22', -6.25, '', 'dining', 'hand'), row('2026-09-23', -6.25, '')]
    expect(ofKind([typed, card], 'counted_twice')).toMatchObject([{ subject: { type: 'shop', id: null, label: 'A charge' } }])
    const long = 'A'.repeat(120)
    const cause = ofKind(charges(['2026-07-20', '2026-08-20', '2026-09-20'], -45, long), 'new_subscription')[0]!.cause
    expect(cause).toBe(`new_subscription:${'A'.repeat(100)}:2026-07-20`)
  })

  it('makes no detector fact where the shops are not given, as on the Month', () => {
    const { shops, ...month } = inputOf([...SPOTIFY, ...GYM])
    expect(shops?.entries).toHaveLength(8)
    expect(onlyDetectors(factsDigest(month).facts)).toEqual([])
  })
})
