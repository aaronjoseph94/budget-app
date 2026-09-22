import { describe, expect, it } from 'vitest'
import { cents, isoDate } from '@budget/money-primitives'
import {
  DEDUPE_HASH_VERSION,
  assignDiscriminators,
  computeDedupeHash,
  dedupeCanonicalString,
  type DedupeInput,
} from '../src/index.js'

const ACCOUNT = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

const charge = (over: Partial<DedupeInput> = {}): DedupeInput => ({
  accountId: ACCOUNT,
  postedOn: isoDate('2025-03-01'),
  amountCents: cents(-825),
  merchantRaw: 'SQ *BLUE BOTTLE COFFEE 4155551234',
  discriminator: { kind: 'occurrence', index: 1 },
  ...over,
})

describe('dedupeCanonicalString — what counts as the same charge', () => {
  it('is stable for the same charge', () => {
    expect(dedupeCanonicalString(charge())).toBe(dedupeCanonicalString(charge()))
  })

  it('carries the version, so a future change can be told apart', () => {
    expect(dedupeCanonicalString(charge()).startsWith(`v${DEDUPE_HASH_VERSION}\u0000`)).toBe(true)
  })

  it.each([
    ['a different account', { accountId: '9f8e7d6c-5b4a-4938-8271-0a1b2c3d4e5f' }],
    ['a different date', { postedOn: isoDate('2025-03-02') }],
    ['a different amount', { amountCents: cents(-826) }],
    ['different raw text', { merchantRaw: 'SQ *BLUE BOTTLE COFFEE 4155551299' }],
  ])('separates two charges differing only by %s', (_label, over) => {
    expect(dedupeCanonicalString(charge(over as Partial<DedupeInput>))).not.toBe(
      dedupeCanonicalString(charge()),
    )
  })

  it('separates a charge from a refund of the same size', () => {
    // Sign is identity, not presentation. See docs/divergences.md D3.
    const spend = dedupeCanonicalString(charge({ amountCents: cents(-4000) }))
    const refund = dedupeCanonicalString(charge({ amountCents: cents(4000) }))
    expect(spend).not.toBe(refund)
  })

  it('keeps two identical coffees on the same day apart', () => {
    // The failure this whole function exists to prevent: without a
    // discriminator these collide and the ledger silently loses one.
    const first = dedupeCanonicalString(charge({ discriminator: { kind: 'occurrence', index: 1 } }))
    const second = dedupeCanonicalString(charge({ discriminator: { kind: 'occurrence', index: 2 } }))
    expect(first).not.toBe(second)
  })

  it('does not confuse an issuer id with an occurrence index of the same value', () => {
    const byIssuer = dedupeCanonicalString(charge({ discriminator: { kind: 'issuer_id', id: '2' } }))
    const byIndex = dedupeCanonicalString(charge({ discriminator: { kind: 'occurrence', index: 2 } }))
    expect(byIssuer).not.toBe(byIndex)
  })

  it('cannot be forged by smuggling the separator into a merchant name', () => {
    // A printable separator could be typed into a merchant string to make two
    // different charges render one identical key. NUL cannot appear, because
    // IngestedTextSchema rejects control characters at the boundary.
    expect(dedupeCanonicalString(charge()).includes('\u0000')).toBe(true)
    const forged = charge({ merchantRaw: `COFFEE\u0000occurrence:1` })
    expect(dedupeCanonicalString(forged)).not.toBe(dedupeCanonicalString(charge()))
  })

  it('refuses a discriminator that cannot identify anything', () => {
    expect(() => dedupeCanonicalString(charge({ discriminator: { kind: 'issuer_id', id: '' } })))
      .toThrow(RangeError)
    expect(() =>
      dedupeCanonicalString(charge({ discriminator: { kind: 'occurrence', index: 0 } })),
    ).toThrow(RangeError)
  })
})

describe('computeDedupeHash', () => {
  it('produces a lowercase hex SHA-256 the row schema will accept', async () => {
    const hash = await computeDedupeHash(charge())
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('agrees with itself and differs for a different charge', async () => {
    const [a, b, c] = await Promise.all([
      computeDedupeHash(charge()),
      computeDedupeHash(charge()),
      computeDedupeHash(charge({ amountCents: cents(-826) })),
    ])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('matches SHA-256 of the canonical string exactly', async () => {
    // Pins the digest to the documented input, so a change to either one that
    // is not a change to both fails here rather than silently re-keying rows.
    const input = charge()
    const expected = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(dedupeCanonicalString(input)),
    )
    const hex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await computeDedupeHash(input)).toBe(hex)
  })
})

describe('the stored key is frozen for version 1', () => {
  // Every test above compares the function with itself, so swapping two fields
  // in the canonical string passed all of them — and would have re-keyed every
  // stored row, making the next import of an old statement a full duplicate.
  // These literals were computed once from the version-1 code and must never
  // be regenerated: a different key means DEDUPE_HASH_VERSION goes up, with a
  // backfill in the same migration, and these gain a version-2 sibling.

  it('is version 1', () => {
    expect(DEDUPE_HASH_VERSION).toBe(1)
  })

  it('builds exactly this string for a fixed charge', () => {
    // Readable where the digest is not: a failure here names the field that moved.
    expect(dedupeCanonicalString(charge())).toBe(
      'v1\u0000f47ac10b-58cc-4372-a567-0e02b2c3d479\u00002025-03-01\u0000-825' +
        '\u0000SQ *BLUE BOTTLE COFFEE 4155551234\u0000occurrence:1',
    )
  })

  it('hashes a fixed charge to exactly this digest', async () => {
    expect(await computeDedupeHash(charge())).toBe(
      '0e9c022458e5c1e162bcadd994ba77407fbb3e6eeedb2eacd6261aa52f02df47',
    )
  })
})

describe('assignDiscriminators', () => {
  const tuple = (r: { date: string; amount: number; merchant: string }) =>
    `${r.date}|${r.amount}|${r.merchant}`

  it('numbers identical rows in the order they appear', () => {
    const rows = [
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE' },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE' },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE' },
    ]
    expect(assignDiscriminators(rows, tuple)).toEqual([
      { kind: 'occurrence', index: 1 },
      { kind: 'occurrence', index: 2 },
      { kind: 'occurrence', index: 3 },
    ])
  })

  it('counts per identical tuple, not per batch', () => {
    const rows = [
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE' },
      { date: '2025-03-01', amount: -1200, merchant: 'LUNCH' },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE' },
    ]
    expect(assignDiscriminators(rows, tuple)).toEqual([
      { kind: 'occurrence', index: 1 },
      { kind: 'occurrence', index: 1 },
      { kind: 'occurrence', index: 2 },
    ])
  })

  it('keeps indices stable when a later import overlaps an earlier one', () => {
    // The re-import case. January's rows must key identically whether they
    // arrive alone or inside a January-to-February export, or every overlapping
    // row duplicates on the second import.
    const january = [
      { date: '2025-01-05', amount: -825, merchant: 'COFFEE' },
      { date: '2025-01-05', amount: -825, merchant: 'COFFEE' },
    ]
    const januaryToFebruary = [
      ...january,
      { date: '2025-02-03', amount: -825, merchant: 'COFFEE' },
      { date: '2025-02-03', amount: -825, merchant: 'COFFEE' },
    ]
    const first = assignDiscriminators(january, tuple)
    const second = assignDiscriminators(januaryToFebruary, tuple)
    expect(second.slice(0, 2)).toEqual(first)
  })

  it('prefers the issuer id and does not count those rows', () => {
    // Mixing the schemes would renumber the id-carrying rows and re-key them.
    const rows = [
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE', txnId: 'TXN-1' },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE', txnId: undefined },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE', txnId: undefined },
    ]
    expect(assignDiscriminators(rows, tuple, (r) => r.txnId)).toEqual([
      { kind: 'issuer_id', id: 'TXN-1' },
      { kind: 'occurrence', index: 1 },
      { kind: 'occurrence', index: 2 },
    ])
  })

  it('treats an issuer id the export left blank as absent, not as an identity', () => {
    // Otherwise every row with an empty id column collapses onto one key, and
    // all but the first of them vanish.
    const rows = [
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE', txnId: '' },
      { date: '2025-03-01', amount: -825, merchant: 'COFFEE', txnId: '' },
    ]
    expect(assignDiscriminators(rows, tuple, (r) => r.txnId)).toEqual([
      { kind: 'occurrence', index: 1 },
      { kind: 'occurrence', index: 2 },
    ])
  })
})
