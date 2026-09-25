import { describe, expect, it } from 'vitest'
import { monthEndForecast } from '../src/index.js'
import { DINING, FLIGHT, PAY, d, example, on } from './forecast-example.js'

/** Suite tests, worked by hand from F30 (docs/formula-decisions.md). */

describe('monthEndForecast (F30)', () => {
  it('gives a range from the pace and three complete months on day 24 of 30', () => {
    // Before spending still to come: 2,000.00 + 2,100.00 + 2,100.00 − 2,180.00
    // − 300.00 − 200.00 = 3,520.00. To come: pace 210.00, June 180.00, July
    // 240.00, August 204.00; the median (204.00 + 210.00) ÷ 2 = 207.00. Ends
    // 3,280.00, 3,313.00 and 3,340.00, each to $10: 3,280, 3,310, 3,340.
    const forecast = monthEndForecast(example)
    expect(forecast).toMatchObject({
      status: 'range',
      checkBackOn: null,
      completeMonths: 3,
      evidence: 'some',
      startCents: 200_000,
      incomeCents: 210_000,
      spentCents: 218_000,
      savedCents: 30_000,
      billsNotChargedCents: 14_000,
      savingsPlannedCents: 20_000,
      variableToComeCents: 21_000,
      spent: { low: 236_000, mid: 239_000, high: 242_000 },
      end: { low: 328_000, mid: 331_000, high: 334_000 },
    })
    expect(forecast.pay.dueCents).toBe(210_000)
  })

  it('gives one rough figure from the months alone before the 7th', () => {
    // 5 September: pay due 2 × 2,080.00 (the latest three by then); Spent
    // 1,340.00 (Rent, and Phone and Internet planned); 500.00 still to save.
    // 2,000.00 + 4,160.00 − 1,340.00 − 500.00 = 4,320.00. 25 days left: June
    // 750.00, July 1,000.00, August 850.00; the median 850.00 gives 3,470.00.
    const forecast = monthEndForecast(on('2026-09-05'))
    expect(forecast).toMatchObject({
      status: 'rough',
      spent: { low: 219_000, mid: 219_000, high: 219_000 },
      end: { low: 347_000, mid: 347_000, high: 347_000 },
    })
  })

  it('is rough with under three complete months, from the pace and what months there are', () => {
    // August alone: pace 210.00 and August 204.00; the median 207.00.
    const forecast = monthEndForecast({ ...example, historyStart: d('2026-08-01') })
    expect(forecast).toMatchObject({ status: 'rough', completeMonths: 1, evidence: 'thin', end: { low: 331_000, mid: 331_000, high: 331_000 } })
  })

  it('is still rough with two complete months, the most under three', () => {
    // July and August: pace 210.00, July 240.00 and August 204.00; the median
    // 210.00 gives 3,520.00 − 210.00 = 3,310.00, one figure.
    const forecast = monthEndForecast({ ...example, historyStart: d('2026-07-01') })
    expect(forecast).toMatchObject({ status: 'rough', completeMonths: 2, end: { low: 331_000, mid: 331_000, high: 331_000 } })
  })

  it('says to check back on the 7th before then with no complete month', () => {
    const forecast = monthEndForecast(on('2026-09-05', { historyStart: d('2026-08-08') }))
    expect(forecast).toMatchObject({ status: 'too_early', checkBackOn: '2026-09-07', spent: null, end: null, variableToComeCents: null })
  })

  it('forecasts no balance without a typed start, and still the projected Spent (D17)', () => {
    const forecast = monthEndForecast({ ...example, startingBalanceCents: null })
    expect(forecast).toMatchObject({ startCents: null, end: null, spent: { low: 236_000, mid: 239_000, high: 242_000 } })
  })

  it('names pay it cannot count, and leaves it out of the end rather than guess', () => {
    // No schedule and no goal: 3,520.00 − 2,100.00 = 1,420.00 before spending
    // still to come; less 207.00 is 1,213.00, $1,210.
    const forecast = monthEndForecast({ ...example, paySchedules: [] })
    expect(forecast.pay.notCounted).toEqual([PAY])
    expect(forecast.end?.mid).toBe(121_000)
  })

  it('counts nothing still to save on a fund already past its goal', () => {
    // $600.00 moved in against a goal of $500.00: 2,000.00 + 4,200.00 −
    // 2,180.00 − 600.00 = 3,420.00; less 207.00 is 3,213.00, $3,210.
    const entries = example.entries.map((e) => (e.categoryId === FLIGHT ? { ...e, amountCents: -60_000 } : e))
    expect(monthEndForecast({ ...example, entries })).toMatchObject({ savingsPlannedCents: 0, end: { mid: 321_000 } })
  })

  it('rounds half-up on the magnitude, so a balance below zero rounds away from it', () => {
    // A start of −1,328.00: −1,328.00 + 1,520.00 − 207.00 = −15.00, which is −$20.
    expect(monthEndForecast({ ...example, startingBalanceCents: -132_800 }).end?.mid).toBe(-2_000)
  })

  it('counts a month refunds took below zero as nothing still to come', () => {
    // August's Variable is −50.00 once refunds are in: its scenario is 0.00,
    // so the scenarios are 0.00, 180.00, 210.00 and 240.00; the most to come is
    // July's, and the least is August's 0.00, an end of 3,520.00.
    const refunds = { postedOn: d('2026-08-12'), amountCents: 110_400, categoryId: DINING }
    expect(monthEndForecast({ ...example, entries: [...example.entries, refunds] }).end).toMatchObject({ low: 328_000, high: 352_000 })
  })
})
