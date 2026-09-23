import { describe, expect, it } from 'vitest'
import {
  describeBalanceFailure,
  describeBudgetFailure,
  describeFailure,
  describePlanFailure,
  describeReason,
  describeSetupFailure,
  describeWriteFailure,
  formatAmount,
  formatBasisPoints,
  formatCents,
  formatDateRange,
  formatForInput,
  formatIsoDate,
  formatMagnitude,
  formatMonthTitle,
  localDateOf,
  todayIso,
} from '../src/format.js'

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [7, '$0.07'],
    [29, '$0.29'],
    [450, '$4.50'],
    [-450, '-$4.50'],
    [123456, '$1,234.56'],
    [-123456, '-$1,234.56'],
    [123456789, '$1,234,567.89'],
    [100, '$1.00'],
    [-1, '-$0.01'],
  ])('renders %i cents as %s', (amount, expected) => {
    expect(formatCents(amount)).toBe(expected)
  })

  it('is exact where a float round-trip is not', () => {
    // 0.29 and 8.70 are the classic float offenders. Formatting from the
    // integer means there is no float to be wrong.
    expect(formatCents(29)).toBe('$0.29')
    expect(formatCents(870)).toBe('$8.70')
    expect(formatCents(87029)).toBe('$870.29')
  })

  it('renders a negative zero as zero', () => {
    expect(formatCents(-0)).toBe('$0.00')
  })
})

describe('formatMonthTitle', () => {
  it('names the month in full, from a month or a date', () => {
    expect(formatMonthTitle('2026-09')).toBe('September 2026')
    expect(formatMonthTitle('2026-01-31')).toBe('January 2026')
    expect(formatMonthTitle('2026-13')).toBe('2026-13')
  })
})

describe('formatIsoDate', () => {
  it('renders a calendar date without going through Date', () => {
    expect(formatIsoDate('2025-03-04')).toBe('4 Mar 2025')
    expect(formatIsoDate('2025-12-31')).toBe('31 Dec 2025')
    expect(formatIsoDate('2024-02-29')).toBe('29 Feb 2024')
  })

  it('returns anything it cannot read unchanged, rather than inventing a date', () => {
    expect(formatIsoDate('nonsense')).toBe('nonsense')
    expect(formatIsoDate('2025-99-01')).toBe('2025-99-01')
  })
})

describe('reasons a person can act on', () => {
  it('turns every rejection code into a sentence', () => {
    // The enum is what the database stores; this is what the user reads.
    for (const code of [
      'row_shape_mismatch',
      'missing_amount',
      'unparseable_date',
      'invalid_merchant',
      'already_in_ledger',
    ]) {
      const text = describeReason(code)
      expect(text.length).toBeGreaterThan(10)
      expect(text).not.toContain('_')
    }
  })

  it('has a fallback rather than showing a raw code to a person', () => {
    expect(describeReason('some_future_code')).toBe('This row could not be read.')
  })

  it('names the line of a file-level failure when it has one', () => {
    expect(describeFailure('unterminated_quote', 7)).toContain('line 7')
    expect(describeFailure('unterminated_quote')).not.toContain('line')
  })
})

describe('describeWriteFailure', () => {
  it('turns a code into a sentence and keeps the code for a screenshot', () => {
    expect(describeWriteFailure({ code: '23514' })).toMatch(/did not add up.*\(code 23514\)$/)
  })

  it('names a dropped connection instead of ending in "undefined"', () => {
    // supabase-js sets no code at all for a network failure — the likeliest
    // first failure there is.
    for (const error of [{}, { code: undefined }, null, undefined]) {
      const message = describeWriteFailure(error)
      expect(message).toMatch(/could not reach the database/i)
      expect(message).not.toMatch(/undefined|: $/)
    }
  })

  it('never passes the database message through', () => {
    // Postgres quotes the offending value, which may be a merchant or an amount.
    const leaky = { code: '23514', message: 'value "SHELL OIL -45.00" violates check' }
    expect(describeWriteFailure(leaky)).not.toMatch(/SHELL|45/)
  })

  it('says something useful about a code it does not know', () => {
    expect(describeWriteFailure({ code: 'XX999' })).toBe('Something went wrong and nothing was saved. (code XX999)')
  })
})

describe('the smaller display helpers', () => {
  it('shows a week inside one month, and one that crosses months', () => {
    expect(formatDateRange('2026-09-21', '2026-09-27')).toBe('21 – 27 Sep')
    expect(formatDateRange('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct')
  })

  it('shows basis points as a whole percentage', () => {
    expect(formatBasisPoints(6_500)).toBe('65%')
    expect(formatBasisPoints(12_000)).toBe('120%')
  })

  it('shows a magnitude without the sign, for places the label carries direction', () => {
    expect(formatMagnitude(-1_200)).toBe('$12.00')
    expect(formatMagnitude(1_200)).toBe('$12.00')
  })

  it('shows a cell amount without the symbol, keeping its sign and cents', () => {
    expect(formatAmount(160_000)).toBe('1,600.00')
    expect(formatAmount(-3_274)).toBe('-32.74')
    expect(formatAmount(0)).toBe('0.00')
  })

  it('gives an amount as it would be typed back in, with no symbol or commas, and none as empty', () => {
    expect(formatForInput(125_050)).toBe('1250.50')
    expect(formatForInput(0)).toBe('0.00')
    expect(formatForInput(null)).toBe('')
  })

  it('gives today as a local ISO date', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('dates a timestamp by the local calendar, not by its UTC string', () => {
    // Pinned to Alberta, so the test bites on a machine running in UTC too:
    // 11:30pm on the 20th in Edmonton is 05:30 on the 21st in UTC, and slicing
    // the UTC string would say the 21st.
    const hostZone = process.env['TZ']
    process.env['TZ'] = 'America/Edmonton'
    try {
      expect(localDateOf('2026-09-21T05:30:00+00:00')).toBe('2026-09-20')
    } finally {
      if (hostZone === undefined) delete process.env['TZ']
      else process.env['TZ'] = hostZone
    }
  })
})

describe('describeSetupFailure', () => {
  it("says what went wrong in Setup's own words, keeping the code", () => {
    expect(describeSetupFailure('remove', { code: '23503' })).toBe(
      'This category still has charges, or shops the app learned to file here. On the Month, tap its row and use Move to… on each charge, with “Always file” ticked so the shop moves too. (code 23503)',
    )
    expect(describeSetupFailure('move', { code: '23514' })).toBe(
      'Remove the monthly amount first (Stop, under its amount), then move it to another list. (code 23514)',
    )
    expect(describeSetupFailure('rename', { code: '23505' })).toMatch(/^You already have a category with that name/)
    expect(describeSetupFailure('rename', { code: '23514' })).toMatch(/^That name has characters the app cannot store/)
  })

  // The import wording is exactly what Setup must not say for these.
  it('never says the numbers did not add up', () => {
    for (const action of ['rename', 'move', 'reorder', 'remove'] as const) {
      expect(describeSetupFailure(action, { code: '23514' })).not.toMatch(/did not add up/)
    }
  })

  it('falls back to the everyday wording for connection and sign-in failures', () => {
    expect(describeSetupFailure('rename', null)).toBe(describeWriteFailure(null))
    expect(describeSetupFailure('move', { code: '28000' })).toBe(describeWriteFailure({ code: '28000' }))
  })
})

describe('describeBudgetFailure', () => {
  it('names the update a read is missing, and never words a read as a save', () => {
    expect(describeBudgetFailure('read', { code: 'PGRST205' })).toBe(
      'Budgets need a database update that has not been applied yet (0008 in the setup guide), so this month cannot be shown. (code PGRST205)',
    )
    expect(describeBudgetFailure('read', { code: '42P01' })).toContain('(0008 in the setup guide)')
    expect(describeBudgetFailure('read', {})).toBe(
      'Could not reach the database to read your budgets. Check your connection and try again.',
    )
    expect(describeBudgetFailure('read', { code: 'XX000' })).toBe(
      'Your budgets could not be read, so this month is not shown. Try again. (code XX000)',
    )
    for (const code of ['PGRST205', '', 'PGRST301', 'XX000']) {
      expect(describeBudgetFailure('read', { code })).not.toContain('saved')
    }
  })
})

describe('describePlanFailure', () => {
  it('names the update a read is missing, and never words a read as a save', () => {
    expect(describePlanFailure('read', { code: '42P01' })).toContain('(0009 in the setup guide), so they are not shown.')
    expect(describePlanFailure('read', {})).toBe(
      'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    )
    expect(describePlanFailure('read', { code: 'PGRST301' })).toBe(
      'Your session expired. Sign in again to see your monthly amounts. (code PGRST301)',
    )
    expect(describePlanFailure('read', { code: 'XX000' })).toBe(
      'Your monthly amounts could not be read, so they are not shown. Try again. (code XX000)',
    )
    for (const code of ['PGRST205', '42P01', '', 'PGRST301', 'XX000']) {
      expect(describePlanFailure('read', { code })).not.toContain('saved')
    }
  })

  it('says the Month is not shown when it cannot read them, since it shows no month without them', () => {
    expect(describePlanFailure('month', { code: 'PGRST205' })).toContain('(0009 in the setup guide), so this month cannot be shown.')
    expect(describePlanFailure('month', { code: '42P01' })).toContain('(0009 in the setup guide), so this month cannot be shown.')
    expect(describePlanFailure('month', {})).toBe(
      'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    )
    expect(describePlanFailure('month', { code: 'PGRST301' })).toBe(
      'Your session expired. Sign in again to see this month. (code PGRST301)',
    )
    expect(describePlanFailure('month', { code: 'XX000' })).toBe(
      'Your monthly amounts could not be read, so this month is not shown. Try again. (code XX000)',
    )
    for (const code of ['PGRST205', '42P01', '', 'PGRST301', 'XX000']) {
      expect(describePlanFailure('month', { code })).not.toContain('saved')
      expect(describePlanFailure('month', { code })).not.toContain('Your lists still work')
    }
  })

  it("says a list can't have an amount, and never that the numbers did not add up", () => {
    expect(describePlanFailure('save', { code: '23514' })).toMatch(/^That list can't have a monthly amount/)
    expect(describePlanFailure('save', { code: '42P01' })).toContain('(0009 in the setup guide). Nothing was saved.')
    expect(describePlanFailure('save', { code: '28000' })).toBe(describeWriteFailure({ code: '28000' }))
  })
})

describe('describeBalanceFailure', () => {
  it('names the update a read is missing, says the Month is not shown, and never words a read as a save', () => {
    for (const code of ['PGRST205', '42P01']) {
      expect(describeBalanceFailure('read', { code })).toBe(
        `Starting balances need a database update that has not been applied yet (0010 in the setup guide), so this month cannot be shown. (code ${code})`,
      )
    }
    expect(describeBalanceFailure('read', {})).toBe(
      'Could not reach the database to read your starting balance. Check your connection and try again.',
    )
    expect(describeBalanceFailure('read', { code: 'PGRST301' })).toBe(
      'Your session expired. Sign in again to see this month. (code PGRST301)',
    )
    expect(describeBalanceFailure('read', { code: 'XX000' })).toBe(
      'Your starting balance could not be read, so this month is not shown. Try again. (code XX000)',
    )
    for (const code of ['PGRST205', '42P01', '', 'PGRST301', 'XX000']) {
      expect(describeBalanceFailure('read', { code })).not.toContain('saved')
    }
  })

  it('says nothing was saved when the update is missing, and otherwise uses the everyday wording', () => {
    for (const code of ['PGRST205', '42P01']) {
      expect(describeBalanceFailure('save', { code })).toBe(
        `Starting balances need a database update that has not been applied yet (0010 in the setup guide). Nothing was saved. (code ${code})`,
      )
    }
    expect(describeBalanceFailure('save', { code: '28000' })).toBe(describeWriteFailure({ code: '28000' }))
    expect(describeBalanceFailure('save', null)).toBe(describeWriteFailure(null))
  })
})
